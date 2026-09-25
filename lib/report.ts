import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import {
  COMPANY_NAME, COMPANY_WEBSITE, CALIFORNIA_NOTICE, REPORT_COVER_NOTICE,
  REPORT_COVER_SHORT, REPORT_REVIEW_NOTE, FCRA_USER_NOTICE, FTC_EMPLOYER_GUIDE_URL,
  FCRA_SUMMARY_OF_RIGHTS_URL, REPORT_DISCLAIMER,
} from './legal'
import { fallbackSummary, firstName } from './summary'
import type { AnalysisFlag } from './types'

// ============================================================================
// The client-facing PDF. Layout follows the industry-standard social media
// report (cover → overview → profiles → post insights → guide → flagged
// post cards → keyword posts → FCRA page), in All-Star branding.
//
// Inclusion rule (enforced by the QUERY that feeds this, and re-checked
// here): a post card appears only if it is NOT suppressed AND has analyst-
// confirmed final_flags. The summary paragraph appears only if an analyst
// saved it. Raw AI output cannot reach this document.
// ============================================================================

// ---------------- Types ----------------

export interface ReportItem {
  platform: string
  url: string | null
  posted_at: string | null
  content_text: string | null
  image: Buffer | null
  image_mime: string | null
  final_flags: AnalysisFlag[]
  reviewer_note: string | null
  redact_image: boolean
}

export interface ReportProfile {
  platform: string
  url: string
  added_by: 'candidate' | 'analyst'
  display_name?: string | null
  handle?: string | null
  bio?: string | null
  following?: number | null
  followers?: number | null
  post_count?: number | null
  is_private?: boolean | null
}

export interface ReportInput {
  orderId: number
  candidateName: string
  clientName: string
  jobTitle: string | null
  lookbackYears: number
  enabledCategoryKeys: string[]
  keywords: string
  identifiers: {
    email: string | null
    location: string | null
    phone: string | null
    company: string | null
    highSchool: string | null
    college: string | null
  }
  profiles: ReportProfile[]
  discoveryRan: boolean
  // Every reviewed, unsuppressed post (flagged or not) — for the word cloud
  // and the "most recent post" line.
  reviewedPosts: { platform: string; posted_at: string | null; content_text: string | null }[]
  approvedSummary: string | null
  consent: { signature_name: string; signed_at: string; disclosure_version: string }
  signedOffByName: string
  signedOffAt: string
  items: ReportItem[]
  generatedAt?: Date
}

// ---------------- Design tokens ----------------

const PAGE_W = 595.28 // A4, like the sample
const PAGE_H = 841.89

const NAVY = '#0B1A45'
const NAVY_DEEP = '#070F2B'
const NAVY_SOFT = '#13296B'
const INK = '#1E2A52'
const BODY = '#3B4257'
const MUTED = '#8A91A5'
const CARD = '#EDEDEB'
const TRACK = '#EEEEEE'
const BLUE = '#4C7BE8'
const BLUE_LINE = '#A9C1F5'
const HIGHLIGHT = '#F5A800'
const BRAND_ORANGE = '#F87C04'

// ---------------- Fonts ----------------

type FontKey = 'light' | 'regular' | 'medium' | 'semibold' | 'bold'
type Fonts = Record<FontKey, string>
const FONT_FILES: Fonts = {
  light: 'Outfit-Light.ttf',
  regular: 'Outfit-Regular.ttf',
  medium: 'Outfit-Medium.ttf',
  semibold: 'Outfit-SemiBold.ttf',
  bold: 'Outfit-Bold.ttf',
}
const FALLBACK: Fonts = {
  light: 'Helvetica', regular: 'Helvetica', medium: 'Helvetica',
  semibold: 'Helvetica-Bold', bold: 'Helvetica-Bold',
}

function registerFonts(doc: PDFKit.PDFDocument): Fonts {
  const out = { ...FALLBACK }
  const dir = path.join(process.cwd(), 'assets', 'fonts')
  for (const k of Object.keys(FONT_FILES) as FontKey[]) {
    const file = path.join(dir, FONT_FILES[k])
    try {
      if (fs.existsSync(file)) {
        doc.registerFont(`o-${k}`, file)
        out[k] = `o-${k}`
      }
    } catch { /* fall back to Helvetica */ }
  }
  return out
}

// ---------------- Helpers ----------------

function fmtDate(d: string | Date | null): string {
  if (!d) return 'Unknown date'
  // posted_at is a DATE column → render in UTC so it doesn't shift a day.
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function fmtDateTime(d: Date): string {
  const tz = process.env.REPORT_TIMEZONE || 'America/New_York'
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: tz })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  return `${date} ${time}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const a = parts[0][0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (a + b).toUpperCase()
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-'
  return n.toLocaleString('en-US')
}

// Report labels, matching the industry-standard wording.
const REPORT_LABELS: Record<string, string> = {
  disparaging: 'DISPARAGING',
  drug_image: 'DRUG IMAGE',
  drug_alcohol: 'DRUG/ALCOHOL MENTION',
  violence_gory: 'GORY IMAGE',
  keywords: 'KEYWORDS',
  nudity: 'NUDITY IMAGE',
  politics: 'POLITICS/GOVERNMENT',
  prejudice: 'PREJUDICE',
  profanity: 'PROFANITY',
  rude_gestures: 'RUDE GESTURES/SYMBOLS',
  self_harm: 'SELF HARM',
  suggestive: 'SUGGESTIVE',
  threats: 'THREATS',
  weapons: 'WEAPONS IMAGE',
}

const GUIDE: Record<string, { title: string; text: string }> = {
  disparaging: { title: 'DISPARAGING', text: 'Name-calling, disrespectful, or derogatory statements toward an individual or group, such as remarks about weight, height, looks, or intelligence.' },
  drug_image: { title: 'DRUG IMAGE', text: 'Images of pills, syringes, or drug paraphernalia. May include smoking, drinking, and injections.' },
  drug_alcohol: { title: 'DRUG/ALCOHOL MENTION', text: 'Statements relating to drug and alcohol use, including slang words, street names, and phrases.' },
  violence_gory: { title: 'GORY/VIOLENCE IMAGE', text: 'Images of disfigurement, open wounds, bloodshed, burns, crime scenes, vehicle crash scenes, explosions, and fighting.' },
  nudity: { title: 'NUDITY IMAGE', text: 'Images of explicit and non-explicit nudity, adult content, or partially exposed body parts. Always redacted in this report.' },
  politics: { title: 'POLITICS/GOVERNMENT', text: 'Statements relating to politics or governmental affairs, including politicians, policies, or the political process.' },
  prejudice: { title: 'PREJUDICE', text: 'Derogatory, abusive, or threatening statements aimed at a group of people. Flags the subject\u2019s conduct, never their own identity or beliefs.' },
  profanity: { title: 'PROFANITY', text: 'Obscene language, cursing, swearing, or crude and vulgar words and phrases.' },
  rude_gestures: { title: 'RUDE GESTURES/SYMBOLS', text: 'Visual depiction of rude gestures, hate symbols, or the flags and symbols of extremist or terrorist groups.' },
  self_harm: { title: 'SELF HARM', text: 'Indications of wanting to hurt oneself or take one\u2019s own life, or mentions of suicide.' },
  suggestive: { title: 'SUGGESTIVE', text: 'Expressions relating to sexual misconduct, or content that could be considered sexually demeaning or sexual harassment.' },
  threats: { title: 'THREATS', text: 'A stated intent to inflict harm on, or take the life of, another person.' },
  weapons: { title: 'WEAPONS IMAGE', text: 'Images of instruments used to cause harm to living beings, including firearms, sharp weapons, explosives, and ammunition.' },
  keywords: { title: 'KEYWORDS', text: 'Posts matching custom keywords (text or images) provided by the end user. Matched words are highlighted.' },
}

function postType(text: string | null): { label: string; text: string | null } {
  if (!text) return { label: 'Post', text }
  if (/^RT @/.test(text)) return { label: 'Repost', text }
  const m = text.match(/^\(comment in r\/[^)]+\):\s*/)
  if (m) return { label: 'Reply', text: text.slice(m[0].length) }
  return { label: 'Post', text }
}

export function handleFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const host = u.hostname
    if (host.includes('facebook.com') && segs[0] === 'profile.php') return u.searchParams.get('id')
    if (host.includes('linkedin.com') && segs[0] === 'in') return segs[1] || null
    if (host.includes('reddit.com') && (segs[0] === 'user' || segs[0] === 'u')) return segs[1] || null
    if (host.includes('youtube.com') && segs[0] === 'channel') return segs[1] || null
    const s = segs[0] || null
    return s ? s.replace(/^@/, '') : null
  } catch {
    return null
  }
}

// ---------------- Word cloud ----------------

const STOPWORDS = new Set((
  'a about above after again against all also am an and any are aren as at be because been before being below between both but by can cant could did didnt do does doesnt doing dont down during each few for from further get got had has have having he her here hers herself him himself his how i if im in into is isnt it its itself ive just know like lol me more most much my myself need no nor not now of off oh ok okay on once one only or other our ours ourselves out over own really re s same she should so some such t than that thats the their theirs them themselves then there these they theyre thing things think this those through to too u under until up us very want was wasnt way we were what when where which while who whom why will with would yall yeah yes you youre your yours yourself yourselves amp rt http https www com go going gonna still even back see say said make made new good day today time well many every via'
).split(/\s+/))

// Never surface protected-characteristic words in the cloud, even from
// unsuppressed posts.
const PROTECTED_TERMS = new Set((
  'church god jesus christ christian muslim islam jewish jew allah bible pray prayer religion religious catholic mosque synagogue temple ' +
  'gay lesbian bisexual trans transgender queer lgbt lgbtq pride ' +
  'pregnant pregnancy baby babies ' +
  'black white asian latino latina hispanic race racial ethnicity ' +
  'cancer diabetes depression anxiety adhd autism disability disabled therapy therapist diagnosis medication meds hospital surgery sick illness ' +
  'union'
).split(/\s+/))

export function wordFrequencies(texts: string[], limit = 40): { word: string; n: number }[] {
  const counts = new Map<string, number>()
  for (const raw of texts) {
    const t = raw
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[@#]\w+/g, ' ')
      .replace(/\(comment in r\/[^)]+\):/g, ' ')
      .replace(/[^a-z'\s-]/g, ' ')
    for (let w of t.split(/\s+/)) {
      w = w.replace(/^['-]+|['-]+$/g, '').replace(/'s$/, '').replace(/'/g, '')
      if (w.length < 3 || STOPWORDS.has(w) || PROTECTED_TERMS.has(w)) continue
      counts.set(w, (counts.get(w) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([word, n]) => ({ word, n }))
    .sort((a, b) => b.n - a.n || a.word.localeCompare(b.word))
    .slice(0, limit)
}

const CLOUD_COLORS = ['#0B1A45', '#2C4A9A', '#4C7BE8', '#6F93E8', '#3A5FC0']

function drawWordCloud(
  doc: PDFKit.PDFDocument,
  F: Fonts,
  words: { word: string; n: number }[],
  box: { x: number; y: number; w: number; h: number }
) {
  if (words.length === 0) {
    doc.font(F.regular).fontSize(8).fill(MUTED)
      .text('Not enough post text to build a word cloud.', box.x, box.y + box.h / 2 - 6, { width: box.w, align: 'center', lineBreak: false })
    return
  }
  const max = words[0].n
  const min = words[words.length - 1].n
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  words.forEach((wd, i) => {
    const t = max === min ? 1 : (wd.n - min) / (max - min)
    const size = 6 + Math.sqrt(t) * (i === 0 ? 30 : 22)
    const font = size > 14 ? F.regular : F.light
    doc.font(font).fontSize(size)
    const w = doc.widthOfString(wd.word)
    const h = size * 0.82
    // Archimedean spiral from the center; first free spot wins.
    for (let step = 0; step < 1400; step++) {
      const angle = step * 0.32
      const radius = 1.6 * angle
      const x = cx + radius * Math.cos(angle) * 1.35 - w / 2
      const y = cy + radius * Math.sin(angle) * 0.8 - h / 2
      if (x < box.x || y < box.y || x + w > box.x + box.w || y + h > box.y + box.h) continue
      const pad = 1.2
      const hit = placed.some((p) =>
        x < p.x + p.w + pad && x + w + pad > p.x && y < p.y + p.h + pad && y + h + pad > p.y
      )
      if (hit) continue
      placed.push({ x, y, w, h })
      doc.fill(CLOUD_COLORS[i % CLOUD_COLORS.length])
        .text(wd.word, x, y - size * 0.16, { lineBreak: false })
      break
    }
  })
}

// ---------------- Drawing primitives ----------------

function navyBackground(doc: PDFKit.PDFDocument, fromY: number) {
  const grad = doc.linearGradient(0, fromY, PAGE_W, PAGE_H)
  grad.stop(0, NAVY_DEEP).stop(0.55, NAVY).stop(1, NAVY_DEEP)
  doc.rect(0, fromY, PAGE_W, PAGE_H - fromY).fill(grad)
  // Soft sweeping curves, like the sample's background.
  doc.save()
  doc.fillOpacity(0.35)
  doc.path(
    `M 0 ${PAGE_H - 70} C 180 ${PAGE_H - 40}, 420 ${PAGE_H - 170}, ${PAGE_W} ${PAGE_H - 330} L ${PAGE_W} ${PAGE_H - 300} C 430 ${PAGE_H - 120}, 200 ${PAGE_H - 10}, 0 ${PAGE_H - 30} Z`
  ).fill(NAVY_SOFT)
  doc.fillOpacity(0.22)
  doc.path(
    `M 120 ${fromY + 220} C 260 ${fromY + 330}, 470 ${fromY + 300}, ${PAGE_W} ${fromY + 190} L ${PAGE_W} ${fromY + 215} C 470 ${fromY + 330}, 250 ${fromY + 360}, 120 ${fromY + 220} Z`
  ).fill(NAVY_SOFT)
  doc.restore()
}

function topBar(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, 119, 14).fill(NAVY)
  doc.rect(119, 0, 236, 14).fill('#EEEEEE')
}

function avatar(doc: PDFKit.PDFDocument, F: Fonts, name: string, cx: number, cy: number, r: number, ring = false) {
  if (ring) doc.circle(cx, cy, r + 1.5).fill('#FFFFFF')
  doc.circle(cx, cy, r).fill('#E6EBF2')
  doc.circle(cx, cy, r * 0.86).lineWidth(0.8).stroke('#CBD5E6')
  const txt = initials(name)
  const size = r * 0.72
  doc.font(F.semibold).fontSize(size)
  const w = doc.widthOfString(txt)
  doc.fill(INK).text(txt, cx - w / 2, cy - size * 0.62, { lineBreak: false })
}

function brandMark(doc: PDFKit.PDFDocument, F: Fonts, x: number, y: number) {
  // Small shield with a star, then the wordmark.
  doc.save()
  doc.path(`M ${x} ${y} L ${x + 11} ${y} L ${x + 11} ${y + 7} C ${x + 11} ${y + 11}, ${x + 5.5} ${y + 13.5}, ${x + 5.5} ${y + 13.5} C ${x + 5.5} ${y + 13.5}, ${x} ${y + 11}, ${x} ${y + 7} Z`)
    .lineWidth(0.9).stroke(BRAND_ORANGE)
  const sx = x + 5.5, sy = y + 6.3, R = 3.2, r = 1.3
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? R : r
    pts.push(`${sx + rad * Math.cos(a)} ${sy + rad * Math.sin(a)}`)
  }
  doc.path(`M ${pts.join(' L ')} Z`).fill(BRAND_ORANGE)
  doc.restore()
  doc.font(F.semibold).fontSize(9.5).fill('#FFFFFF')
    .text('ALL-STAR', x + 16, y + 0.5, { lineBreak: false, characterSpacing: 1.6 })
  doc.font(F.regular).fontSize(4.2).fill('#C9D1E8')
    .text('SCREENING', x + 16.5, y + 11.2, { lineBreak: false, characterSpacing: 2.4 })
}

function platformIcon(doc: PDFKit.PDFDocument, F: Fonts, platform: string, cx: number, cy: number, s: number, color = BLUE) {
  const p = platform.toLowerCase()
  doc.save()
  if (p.includes('facebook')) {
    doc.circle(cx, cy, s / 2).fill(color)
    doc.font(F.bold).fontSize(s * 0.95).fill('#FFFFFF')
    const w = doc.widthOfString('f')
    doc.text('f', cx - w / 2 + s * 0.04, cy - s * 0.44, { lineBreak: false })
  } else if (p.includes('x (') || p === 'x' || p.includes('twitter')) {
    const h = s / 2
    doc.lineWidth(s * 0.1).lineCap('round')
    doc.moveTo(cx - h * 0.8, cy - h * 0.85).lineTo(cx + h * 0.8, cy + h * 0.85).stroke(color)
    doc.lineWidth(s * 0.07)
    doc.moveTo(cx + h * 0.8, cy - h * 0.85).lineTo(cx - h * 0.8, cy + h * 0.85).stroke(color)
  } else if (p.includes('instagram')) {
    doc.lineWidth(s * 0.09)
    doc.roundedRect(cx - s / 2, cy - s / 2, s, s, s * 0.28).stroke(color)
    doc.circle(cx, cy, s * 0.22).stroke(color)
    doc.circle(cx + s * 0.27, cy - s * 0.27, s * 0.055).fill(color)
  } else if (p.includes('reddit')) {
    doc.circle(cx, cy + s * 0.08, s * 0.42).fill(color)
    doc.circle(cx + s * 0.2, cy - s * 0.42, s * 0.08).fill(color)
    doc.circle(cx - s * 0.15, cy + s * 0.05, s * 0.07).fill('#FFFFFF')
    doc.circle(cx + s * 0.15, cy + s * 0.05, s * 0.07).fill('#FFFFFF')
  } else if (p.includes('linkedin')) {
    doc.font(F.bold).fontSize(s * 0.95).fill(color)
    const w = doc.widthOfString('in')
    doc.text('in', cx - w / 2, cy - s * 0.58, { lineBreak: false })
  } else if (p.includes('tiktok')) {
    doc.lineWidth(s * 0.13).lineCap('round')
    doc.moveTo(cx + s * 0.05, cy - s * 0.45).lineTo(cx + s * 0.05, cy + s * 0.2).stroke(color)
    doc.circle(cx - s * 0.13, cy + s * 0.25, s * 0.18).lineWidth(s * 0.12).stroke(color)
    doc.moveTo(cx + s * 0.05, cy - s * 0.45).quadraticCurveTo(cx + s * 0.15, cy - s * 0.2, cx + s * 0.38, cy - s * 0.18).lineWidth(s * 0.11).stroke(color)
  } else if (p.includes('youtube')) {
    doc.roundedRect(cx - s * 0.55, cy - s * 0.38, s * 1.1, s * 0.76, s * 0.2).fill(color)
    doc.path(`M ${cx - s * 0.13} ${cy - s * 0.2} L ${cx + s * 0.22} ${cy} L ${cx - s * 0.13} ${cy + s * 0.2} Z`).fill('#FFFFFF')
  } else if (p.includes('pinterest')) {
    doc.circle(cx, cy, s / 2).fill(color)
    doc.font(F.bold).fontSize(s * 0.8).fill('#FFFFFF')
    const w = doc.widthOfString('P')
    doc.text('P', cx - w / 2, cy - s * 0.44, { lineBreak: false })
  } else if (p.includes('threads')) {
    doc.font(F.semibold).fontSize(s * 1.05).fill(color)
    const w = doc.widthOfString('@')
    doc.text('@', cx - w / 2, cy - s * 0.66, { lineBreak: false })
  } else {
    doc.lineWidth(s * 0.08)
    doc.circle(cx, cy, s / 2).stroke(color)
    doc.ellipse(cx, cy, s * 0.2, s / 2).stroke(color)
    doc.moveTo(cx - s / 2, cy).lineTo(cx + s / 2, cy).stroke(color)
  }
  doc.restore()
}

function flagIcon(doc: PDFKit.PDFDocument, x: number, y: number, s: number, color = BLUE) {
  doc.save()
  doc.rect(x, y, s * 0.12, s).fill(color)
  doc.path(`M ${x + s * 0.12} ${y} L ${x + s * 0.85} ${y + s * 0.05} L ${x + s * 0.65} ${y + s * 0.28} L ${x + s * 0.85} ${y + s * 0.5} L ${x + s * 0.12} ${y + s * 0.55} Z`).fill(color)
  doc.restore()
}

function dotIcon(doc: PDFKit.PDFDocument, x: number, y: number, s: number, color = BLUE) {
  doc.save()
  doc.circle(x + s / 2, y + s / 2, s / 2).lineWidth(0.7).stroke(color)
  doc.circle(x + s / 2, y + s / 2, s / 5).fill(color)
  doc.restore()
}

// PDF fonts can't draw color emoji or scripts the font lacks: replace emoji
// runs with "(emoji)" and drop any other character without a glyph, so the
// report never shows empty boxes.
function printable(doc: PDFKit.PDFDocument, text: string): string {
  let out = text.replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200D\uFE0F\u{1F3FB}-\u{1F3FF}])+/gu, ' (emoji) ')
  const f: any = (doc as any)._font?.font
  if (f && typeof f.hasGlyphForCodePoint === 'function') {
    out = Array.from(out)
      .filter((ch) => {
        const cp = ch.codePointAt(0)!
        return cp === 10 || cp === 32 || f.hasGlyphForCodePoint(cp)
      })
      .join('')
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

// Word-wrapped text with highlighted keywords. Returns the y after the
// last line drawn.
function richText(
  doc: PDFKit.PDFDocument,
  font: string,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  lineH: number,
  maxLines: number,
  highlight: string[],
  color = BODY
): number {
  doc.font(font).fontSize(size)
  text = printable(doc, text)
  const kw = highlight.map((k) => k.toLowerCase()).filter(Boolean)
  const isKw = (tok: string) => {
    const t = tok.toLowerCase().replace(/[^a-z0-9'-]/g, '')
    return !!t && kw.some((k) => t === k || t === k + 's' || t === k + 'es')
  }
  const space = doc.widthOfString(' ')
  const lines: { t: string; w: number }[][] = []
  for (const para of text.replace(/\r/g, '').split('\n')) {
    let cur: { t: string; w: number }[] = []
    let curW = 0
    for (let word of para.split(/\s+/).filter(Boolean)) {
      let w = doc.widthOfString(word)
      while (w > width) {
        // Break very long tokens (URLs) across lines.
        let cut = word.length
        while (cut > 1 && doc.widthOfString(word.slice(0, cut)) > width) cut--
        if (cur.length) { lines.push(cur); cur = []; curW = 0 }
        lines.push([{ t: word.slice(0, cut), w: doc.widthOfString(word.slice(0, cut)) }])
        word = word.slice(cut)
        w = doc.widthOfString(word)
      }
      if (!word) continue
      const add = (cur.length ? space : 0) + w
      if (curW + add > width && cur.length) {
        lines.push(cur)
        cur = [{ t: word, w }]
        curW = w
      } else {
        cur.push({ t: word, w })
        curW += add
      }
    }
    lines.push(cur)
  }
  let truncated = false
  if (lines.length > maxLines) {
    lines.length = maxLines
    truncated = true
  }
  let cy = y
  lines.forEach((ln, li) => {
    let cx = x
    ln.forEach((tok, ti) => {
      let t = tok.t
      if (truncated && li === lines.length - 1 && ti === ln.length - 1) t = t + '…'
      if (isKw(t)) {
        const core = t.replace(/[^A-Za-z0-9'-]+$/, '')
        const cw = doc.widthOfString(core)
        doc.rect(cx - 0.6, cy - size * 0.08, cw + 1.2, size * 1.2).fill(HIGHLIGHT)
        doc.fill('#FFFFFF').text(core, cx, cy, { lineBreak: false })
        if (core.length < t.length) doc.fill(color).text(t.slice(core.length), cx + cw, cy, { lineBreak: false })
      } else {
        doc.fill(color).text(t, cx, cy, { lineBreak: false })
      }
      cx += doc.widthOfString(t) + space
    })
    cy += lineH
  })
  return cy
}

async function prepareImage(buf: Buffer, redact: boolean): Promise<Buffer | null> {
  try {
    if (redact) {
      const meta = await sharp(buf).metadata()
      const w = Math.min(meta.width || 600, 600)
      const small = await sharp(buf).rotate().resize({ width: 18 }).blur(1.5).png().toBuffer()
      return await sharp(small).resize({ width: w, kernel: 'cubic' }).blur(6).png().toBuffer()
    }
    return await sharp(buf).rotate().resize({ width: 900, withoutEnlargement: true }).png().toBuffer()
  } catch {
    return null
  }
}

// One-line heading that shrinks to fit (long names never wrap into the
// subtitle underneath).
function fitLine(doc: PDFKit.PDFDocument, font: string, text: string, x: number, y: number, maxW: number, size: number, color: string) {
  let sz = size
  doc.font(font).fontSize(sz)
  while (sz > 11 && doc.widthOfString(text) > maxW) {
    sz -= 0.5
    doc.fontSize(sz)
  }
  let t = text
  while (t.length > 4 && doc.widthOfString(t) > maxW) t = t.slice(0, -2)
  if (t !== text) t = t.trimEnd() + '…'
  // Keep the baseline where the full-size text would sit.
  doc.fill(color).text(t, x, y + (size - sz) * 0.8, { lineBreak: false })
}

// ---------------- Main ----------------

type Footer = 'none' | 'darkRight' | 'lightRight' | 'insights'

export async function buildReportPdf(input: ReportInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, autoFirstPage: false })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))
  const F = registerFonts(doc)
  doc.info.Title = `Social Media Report - ${input.candidateName}`
  doc.info.Author = COMPANY_NAME

  const footers: Footer[] = []
  const newPage = (footer: Footer) => {
    doc.addPage({ size: 'A4', margin: 0 })
    footers.push(footer)
  }

  const generatedAt = input.generatedAt || new Date()
  const name = input.candidateName
  const first = firstName(name)
  const items = input.items.filter((i) => Array.isArray(i.final_flags) && i.final_flags.length > 0)
  const keywordList = input.keywords.split(',').map((k) => k.trim()).filter(Boolean)
  const keywordItems = items.filter((i) => i.final_flags.some((f) => f.category === 'keywords'))

  const counts = new Map<string, number>()
  for (const it of items) for (const f of it.final_flags) counts.set(f.category, (counts.get(f.category) || 0) + 1)
  const totalBehaviors = Array.from(counts.values()).reduce((a, b) => a + b, 0)

  type StatKey = 'followers' | 'following' | 'post_count'
  const withStat = (k: StatKey) => input.profiles.filter((p) => typeof p[k] === 'number')
  const sum = (k: StatKey) => withStat(k).reduce((a, p) => a + (p[k] as number), 0)

  const words = wordFrequencies(input.reviewedPosts.map((p) => p.content_text || ''))

  // =================== PAGE 1: COVER ===================
  newPage('none')
  navyBackground(doc, 294)
  doc.roundedRect(50, 72, 500, 548, 9).fill(CARD)
  avatar(doc, F, name, 132, 168, 37)
  fitLine(doc, F.bold, name, 100, 226, 420, 28, INK)
  doc.rect(93, 330, 129, 5).fill(NAVY)
  doc.font(F.semibold).fontSize(17).fill(INK).text('SOCIAL MEDIA REPORT', 93, 347, { lineBreak: false })
  let y = 380
  doc.font(F.regular).fontSize(7.3).fill(BODY).text(REPORT_COVER_SHORT, 93, y, { width: 408, lineGap: 4.2 })
  y = doc.y + 8
  doc.text(REPORT_REVIEW_NOTE, 93, y, { width: 408, lineGap: 4.2 })
  y = doc.y + 8
  doc.font(F.medium).fontSize(7.3).fill(INK).text(
    `Prepared for ${input.clientName}${input.jobTitle ? ` · ${input.jobTitle}` : ''}   ·   Screening ID ASP-${String(input.orderId).padStart(5, '0')}`,
    93, y, { width: 408, lineBreak: false, ellipsis: true }
  )
  const caBody = CALIFORNIA_NOTICE.replace(/^CALIFORNIA NOTICE\s*/, '').trim()
  let caSize = 7.1
  doc.font(F.regular).fontSize(caSize)
  while (caSize > 5.6 && doc.heightOfString(caBody, { width: 408, lineGap: 4 }) > 100) {
    caSize -= 0.2
    doc.fontSize(caSize)
  }
  const caTop = Math.max(488, y + 24)
  doc.font(F.regular).fontSize(8.2).fill('#222222').text('CALIFORNIA NOTICE', 93, caTop, { lineBreak: false })
  doc.font(F.regular).fontSize(caSize).fill(BODY).text(caBody, 93, caTop + 16, { width: 408, lineGap: 4 })
  brandMark(doc, F, 74, 764)
  doc.font(F.regular).fontSize(10.5).fill('#FFFFFF')
    .text(COMPANY_WEBSITE, 300, 765, { width: 231, align: 'right', lineBreak: false })
  doc.font(F.regular).fontSize(6.5).fill('#FFFFFF')
    .text(`Prepared ${fmtDateTime(generatedAt)} Confidential`, 0, 822, { width: PAGE_W, align: 'center', lineBreak: false })

  // =================== PAGE 2: OVERVIEW ===================
  newPage('darkRight')
  topBar(doc)
  navyBackground(doc, 229)
  avatar(doc, F, name, 70, 107, 37)
  fitLine(doc, F.bold, name, 122, 78, 440, 26, INK)
  doc.font(F.regular).fontSize(15).fill(INK).text('SOCIAL MEDIA OVERVIEW', 122, 116, { lineBreak: false, characterSpacing: 0.6 })

  // Abstract: computed facts only — no AI.
  const privateCount = input.profiles.filter((p) => p.is_private).length
  const totalPostsKnown = withStat('post_count').length > 0
  const latest = input.reviewedPosts
    .filter((p) => p.posted_at)
    .sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)))[0]
  const abs: string[] = []
  {
    const n = input.profiles.length
    let s = `${name} has ${n} social media profile${n === 1 ? '' : 's'} associated with this screening`
    s += privateCount ? `, ${privateCount} of which ${privateCount === 1 ? 'is' : 'are'} set to private.` : '.'
    const r = input.reviewedPosts.length
    s += ` ${r} public post${r === 1 ? ' was' : 's were'} reviewed within the ${input.lookbackYears}-year lookback window`
    s += latest ? `, and the most recent was on ${fmtDate(latest.posted_at)} on ${latest.platform}.` : '.'
    if (withStat('followers').length) {
      const f = sum('followers')
      s += ` ${first} has ${fmtNum(f)} follower${f === 1 ? '' : 's'} across the platforms that report this figure.`
    }
    abs.push(s)
  }
  if (words.length >= 3 && words[0].n >= 3) {
    abs.push(`The words ${first} uses most often are "${words[0].word}", "${words[1].word}", and "${words[2].word}".`)
  }
  abs.push(
    items.length
      ? `${items.length} post${items.length === 1 ? ' was' : 's were'} flagged, for ${totalBehaviors} flagged behavior${totalBehaviors === 1 ? '' : 's'} in total. Every flag was confirmed by an analyst.`
      : 'No posts were flagged for the behaviors screened.'
  )
  const summaryText = (input.approvedSummary && input.approvedSummary.trim()) || fallbackSummary(name, counts)

  doc.font(F.regular).fontSize(8)
  const absH = abs.reduce((h, p) => h + doc.heightOfString(p, { width: 352, lineGap: 3.2 }) + 8, 0)
  const sumH = doc.heightOfString(summaryText, { width: 352, lineGap: 3.2 })
  const cardH = Math.min(Math.max(58 + absH + 44 + sumH + 34, 300), 470)
  doc.roundedRect(75, 193, 428, cardH, 9).fill(CARD)
  doc.font(F.semibold).fontSize(15).fill(INK).text('Abstract', 112, 234, { lineBreak: false })
  y = 262
  for (const p of abs) {
    doc.font(F.regular).fontSize(8).fill(BODY).text(p, 112, y, { width: 352, lineGap: 3.2 })
    y = doc.y + 8
  }
  y += 10
  doc.font(F.regular).fontSize(10.5).fill('#222222').text('FLAGGED POST SUMMARY', 112, y, { lineBreak: false })
  const badge = 'ANALYST REVIEWED'
  doc.font(F.regular).fontSize(6.4)
  const bw = doc.widthOfString(badge) + 14
  const bx = 112 + 145
  doc.roundedRect(bx, y - 3.5, bw, 15, 3).fill(BLUE)
  doc.fill('#FFFFFF').text(badge, bx + 7, y + 0.5, { lineBreak: false })
  y += 22
  doc.font(F.regular).fontSize(8).fill(BODY)
    .text(summaryText, 112, y, { width: 352, lineGap: 3.2, height: Math.max(20, 193 + cardH - y - 16), ellipsis: true })

  const statY = Math.max(595, 193 + cardH + 50)
  const stat = (cx: number, value: string, label: string) => {
    doc.font(F.regular).fontSize(13)
    const w = Math.max(39, doc.widthOfString(value) + 18)
    doc.roundedRect(cx - w / 2, statY, w, 28, 4).lineWidth(0.8).stroke('#FFFFFF')
    doc.fill('#FFFFFF').text(value, cx - w / 2, statY + 7.5, { width: w, align: 'center', lineBreak: false })
    doc.font(F.regular).fontSize(7.5).fill('#C9D1E8').text(label, cx - 80, statY + 38, { width: 160, align: 'center', lineBreak: false })
  }
  stat(181, String(input.profiles.length), 'SOCIAL PROFILES')
  stat(405, String(totalBehaviors), 'FLAGGED BEHAVIORS')

  // =================== PAGE 3: PROFILES ===================
  newPage('lightRight')
  doc.rect(0, 0, PAGE_W, 110).fill(NAVY)
  avatar(doc, F, name, 65, 57, 36, true)
  fitLine(doc, F.bold, name, 111, 30, 250, 24, '#FFFFFF')
  doc.font(F.regular).fontSize(14).fill('#FFFFFF').text('SOCIAL MEDIA PROFILES', 111, 62, { lineBreak: false })

  const props: [string, string | null][] = [
    ['FULL NAME', name],
    ['LOCATION', input.identifiers.location],
    ['EMAIL', input.identifiers.email],
    ['HIGH SCHOOL', input.identifiers.highSchool],
    ['COLLEGE', input.identifiers.college],
    ['COMPANY', input.identifiers.company],
    ['PHONE NUMBER', input.identifiers.phone],
  ]
  const shownProps = props.filter(([, v]) => v && v.trim())
  const propCardH = Math.max(200, 50 + shownProps.length * 17 + 14)
  doc.roundedRect(377, 66, 186, propCardH, 7).fill(CARD)
  doc.font(F.semibold).fontSize(8.5).fill(INK).text('SUBJECT PROPERTIES PROVIDED', 392, 86, { lineBreak: false })
  y = 108
  for (const [label, value] of shownProps) {
    doc.font(F.semibold).fontSize(6.8).fill(INK)
    const lw = doc.widthOfString(`${label}: `)
    doc.text(`${label}: `, 392, y, { lineBreak: false })
    // Value shrinks, then truncates, to stay inside the card.
    const room = 377 + 186 - 12 - (392 + lw)
    let vs = 6.8
    let v = printable(doc, String(value))
    doc.font(F.regular).fontSize(vs)
    while (vs > 5.2 && doc.widthOfString(v) > room) { vs -= 0.2; doc.fontSize(vs) }
    if (doc.widthOfString(v) > room) {
      while (v.length > 3 && doc.widthOfString(v + '…') > room) v = v.slice(0, -1)
      v += '…'
    }
    doc.fill(BODY).text(v, 392 + lw, y + (6.8 - vs) * 0.8, { lineBreak: false })
    y += 17
  }

  const SEARCHED = ['Facebook', 'Instagram', 'LinkedIn', 'X (Twitter)', 'TikTok', 'Reddit', 'YouTube', 'Pinterest']
  const havePlatforms = new Set(input.profiles.map((p) => p.platform))
  const missing = SEARCHED.filter((p) => !havePlatforms.has(p))
  doc.font(F.semibold).fontSize(10.5).fill(INK).text('SOCIAL MEDIA PLATFORMS WITH NO PROFILES MATCHED', 32, 134, { lineBreak: false })
  doc.font(F.regular).fontSize(6.8).fill(BODY).text(
    input.discoveryRan
      ? 'The following is a list of social media platforms that were searched and where no profile for your subject was confirmed by an analyst.'
      : 'Automated profile search was not run for this screening; profiles were provided by the subject or verified by an analyst. The following platforms have no profile on file.',
    32, 150, { width: 320, lineGap: 2.5 }
  )
  y = doc.y + 8
  let mx = 32
  for (const pl of missing) {
    const label = pl.replace(' (Twitter)', '')
    doc.font(F.regular).fontSize(6.8)
    const lw = doc.widthOfString(label)
    if (mx + 13 + lw > 350) { mx = 32; y += 14 }
    platformIcon(doc, F, pl, mx + 5, y + 5, 8, MUTED)
    doc.font(F.regular).fontSize(6.8).fill(MUTED).text(label, mx + 13, y + 1.5, { lineBreak: false })
    mx += 13 + lw + 12
  }
  if (missing.length === 0) {
    doc.font(F.regular).fontSize(6.8).fill(MUTED).text('None.', 32, y + 1.5, { lineBreak: false })
  }

  let ty = Math.max(y + 34, 66 + propCardH + 12)
  doc.font(F.semibold).fontSize(10.5).fill(INK).text('SOCIAL MEDIA PROFILES MATCHED AND ANALYZED', 32, ty, { lineBreak: false })
  doc.font(F.regular).fontSize(6.8).fill(BODY).text(
    'The following is a list of confirmed profiles associated with this subject and their following/followers/post count statistics. A profile marked Private could not be reviewed, so no posts were analyzed from it.',
    32, ty + 16, { width: 360, lineGap: 2.5 }
  )
  ty = doc.y + 14
  const statCols = [450, 485, 520]
  for (const p of input.profiles) {
    if (ty > PAGE_H - 70) {
      newPage('lightRight')
      topBar(doc)
      ty = 50
    }
    platformIcon(doc, F, p.platform, 40, ty + 5, 9)
    const handle = p.handle || handleFromUrl(p.url) || ''
    doc.font(F.medium)
    const display = p.display_name ? printable(doc, p.display_name) : ''
    if (display) {
      doc.font(F.medium).fontSize(7).fill('#222222').text(display + ' ', 56, ty, { continued: true, lineBreak: false })
        .font(F.regular).fill(BODY).text(handle, { lineBreak: false })
    } else {
      doc.font(F.regular).fontSize(7).fill('#222222').text(handle || p.platform, 56, ty, { lineBreak: false })
    }
    if (p.bio) {
      doc.font(F.regular).fontSize(5.3).fill(MUTED).text(printable(doc, p.bio), 56, ty + 10, { width: 160, height: 14, lineGap: 1, ellipsis: true })
    }
    const pill = (label: string, px: number) => {
      doc.font(F.regular).fontSize(5.4)
      const w = doc.widthOfString(label) + 12
      doc.roundedRect(px, ty + 0.5, w, 11, 3).lineWidth(0.6).stroke(BLUE)
      doc.fill(BLUE).text(label, px + 6, ty + 3.4, { lineBreak: false })
      return w
    }
    let px = 222
    if (p.added_by === 'candidate') px += pill('Provided', px) + 4
    if (p.is_private) pill('Private', px)
    // Clickable profile link
    doc.font(F.regular).fontSize(5.3).fill(BLUE)
    const bare = p.url.replace(/^https?:\/\/(www\.)?/, '')
    let shown = bare
    while (shown.length > 8 && doc.widthOfString(shown + '…') > 150) shown = shown.slice(0, -1)
    if (shown !== bare) shown += '…'
    doc.text(shown, 290, ty + 3.5, { lineBreak: false, link: p.url })
    const vals = [p.following, p.followers, p.post_count]
    const labels = ['Following', 'Followers', 'Post Count']
    statCols.forEach((sx, i) => {
      doc.font(F.regular).fontSize(9.5).fill(BODY).text(fmtNum(vals[i]), sx, ty - 2, { lineBreak: false })
      doc.font(F.regular).fontSize(5.8).fill(BODY).text(labels[i], sx, ty + 10, { lineBreak: false })
    })
    ty += 29.5
  }
  if (input.profiles.length === 0) {
    doc.font(F.regular).fontSize(7.5).fill(MUTED).text('No profiles were confirmed for this subject.', 32, ty, { lineBreak: false })
    ty += 20
  }

  ty += 14
  if (ty < PAGE_H - 110) {
    doc.font(F.semibold).fontSize(10.5).fill(INK).text('SCREENING SCOPE', 32, ty, { lineBreak: false })
    const cats = input.enabledCategoryKeys.map((k) => (REPORT_LABELS[k] || k).toLowerCase()).join(', ')
    doc.font(F.regular).fontSize(6.8).fill(BODY).text(
      `Public content from the last ${input.lookbackYears} years was reviewed for: ${cats}${keywordList.length ? ', plus client keywords' : ''}. Content revealing legally protected characteristics is excluded automatically and never appears in this report.`,
      32, ty + 16, { width: 530, lineGap: 2.5 }
    )
  }

  // =================== PAGE 4: POST INSIGHTS ===================
  newPage('insights')
  doc.rect(0, 0, PAGE_W, 107).fill(NAVY)
  avatar(doc, F, name, 65, 54, 36, true)
  fitLine(doc, F.bold, name, 111, 28, 440, 24, '#FFFFFF')
  doc.font(F.regular).fontSize(14).fill('#FFFFFF').text('POST INSIGHTS', 111, 60, { lineBreak: false })

  doc.font(F.semibold).fontSize(12).fill('#101A3A').text('BEHAVIORAL COMPOSITION', 32, 143, { lineBreak: false })
  doc.font(F.regular).fontSize(7.8).fill('#666666').text('This graph indicates the number of posts that were flagged for each behavioral attribute.', 32, 163, { width: 230, lineGap: 3 })
  doc.roundedRect(457, 142, 106, 59, 9).lineWidth(0.8).stroke('#222222')
  doc.font(F.bold).fontSize(22).fill('#101A3A').text(String(totalBehaviors), 469, 152, { lineBreak: false })
  doc.font(F.regular).fontSize(6.5).fill('#222222').text('FLAGGED BEHAVIORS', 469, 181, { lineBreak: false })

  const catKeys = [...input.enabledCategoryKeys, ...(keywordList.length ? ['keywords'] : [])]
    .filter((k) => REPORT_LABELS[k])
    .sort((a, b) => REPORT_LABELS[a].localeCompare(REPORT_LABELS[b]))
  const half = Math.ceil(catKeys.length / 2)
  const maxCount = Math.max(1, ...Array.from(counts.values()))
  const drawBars = (keys: string[], lx: number, bx0: number) => {
    keys.forEach((k, i) => {
      const by = 222 + i * 16.3
      doc.font(F.regular).fontSize(7.3).fill('#222222').text(REPORT_LABELS[k], lx, by + 1.2, { lineBreak: false })
      const BW = 140
      doc.roundedRect(bx0, by, BW, 11.5, 2).fill(TRACK)
      const n = counts.get(k) || 0
      if (n > 0) {
        const w = Math.max(20, (n / maxCount) * BW)
        doc.roundedRect(bx0, by, w, 11.5, 5.75).fill(NAVY)
        doc.rect(bx0, by, Math.min(6, w), 11.5).fill(NAVY)
        doc.font(F.regular).fontSize(7).fill('#FFFFFF').text(String(n), bx0, by + 2, { width: w - 6, align: 'right', lineBreak: false })
      }
    })
  }
  drawBars(catKeys.slice(0, half), 32, 149)
  drawBars(catKeys.slice(half), 307, 424)

  const cloudTop = Math.max(390, 222 + half * 16.3 + 40)
  drawWordCloud(doc, F, words, { x: 34, y: cloudTop, w: 238, h: 190 })
  doc.font(F.semibold).fontSize(12).fill('#101A3A').text('WORD CLOUD', 299, cloudTop + 15, { lineBreak: false })
  doc.font(F.regular).fontSize(7.8).fill('#666666').text(
    `This is your subject's word cloud. It provides insight into the topics your subject refers to most often in their reviewed posts. The larger the word, the higher the frequency. Colors are for readability only.`,
    299, cloudTop + 35, { width: 265, lineGap: 3.2 }
  )

  const pfY = cloudTop + 222
  doc.font(F.semibold).fontSize(12).fill('#101A3A').text('POSTS AND FOLLOWERS', 32, pfY, { lineBreak: false })
  doc.font(F.regular).fontSize(7.8).fill('#666666').text(
    'This shows the total followers, followings, and post count across all social media platforms that expose these metrics. Note that not all platforms report these values.',
    32, pfY + 20, { width: 530, lineGap: 3 }
  )
  const boxY = pfY + 48
  doc.roundedRect(32, boxY, 531, 100, 9).fill(CARD)
  const pfStat = (cx: number, v: string, label: string) => {
    doc.font(F.bold).fontSize(22).fill('#101A3A').text(v, cx - 80, boxY + 28, { width: 160, align: 'center', lineBreak: false })
    doc.font(F.regular).fontSize(10).fill('#222222').text(label, cx - 80, boxY + 58, { width: 160, align: 'center', lineBreak: false })
  }
  pfStat(123, withStat('followers').length ? fmtNum(sum('followers')) : '-', 'Total followers')
  pfStat(290, withStat('following').length ? fmtNum(sum('following')) : '-', 'Total following')
  pfStat(480,
    totalPostsKnown ? fmtNum(sum('post_count')) : fmtNum(input.reviewedPosts.length),
    totalPostsKnown ? 'Total posts' : 'Posts reviewed')

  // =================== PAGE 5: POST PAGES GUIDE ===================
  newPage('none')
  topBar(doc)
  doc.font(F.semibold).fontSize(19).fill(INK).text('POST PAGES GUIDE', 32, 66, { lineBreak: false })
  doc.font(F.regular).fontSize(8.4).fill('#222222').text(
    'The following pages in this report may contain a list of flagged posts for your subject. There will be a maximum of four (4) posts listed per page. Each post includes the text and also the image associated with the post if media were included. A flagged post means that the post content triggered one or more of the behavioral attributes below and was confirmed by an analyst.',
    32, 97, { width: 532, lineGap: 1.8 }
  )
  doc.font(F.light).fontSize(8.4).fill('#333333')
    .text('The figure below illustrates the general composition of each post and identifies the main elements.', 32, doc.y + 6, { lineBreak: false })

  {
    const dx = 88, dy = 235, dw = 155, dh = 176
    doc.roundedRect(dx, dy, dw, dh, 9).lineWidth(0.8).stroke(BLUE_LINE)
    doc.rect(dx + dw / 2 - 11, dy - 2, 22, 4).fill('#FFFFFF')
    platformIcon(doc, F, 'Facebook', dx + dw / 2, dy, 10)
    doc.roundedRect(dx + 8, dy + 13, 30, 8, 2).lineWidth(0.5).stroke(BLUE)
    doc.font(F.regular).fontSize(4.3).fill(BLUE).text('POST', dx + 8, dy + 15.3, { width: 30, align: 'center', lineBreak: false })
    doc.roundedRect(dx + 45, dy + 13, 88, 8, 2).lineWidth(0.5).stroke(BLUE)
    doc.font(F.light).fontSize(4.3).fill(BLUE).text('date of post', dx + 45, dy + 15.3, { width: 88, align: 'center', lineBreak: false })
    doc.dash(1.2, { space: 1.2 })
    doc.rect(dx + 8, dy + 28, dw - 16, 28).lineWidth(0.5).stroke(BLUE_LINE)
    doc.rect(dx + 8, dy + 62, dw - 16, 90).lineWidth(0.5).stroke(BLUE_LINE)
    doc.undash()
    doc.font(F.light).fontSize(5.5).fill(BLUE).text('Text section of post', dx, dy + 39, { width: dw, align: 'center', lineBreak: false })
    doc.text('Image section of post', dx, dy + 68, { width: dw, align: 'center', lineBreak: false })
    const gx = dx + dw / 2 - 25, gy = dy + 88
    doc.roundedRect(gx + 8, gy - 6, 42, 32, 2).lineWidth(3).stroke(BLUE)
    doc.roundedRect(gx, gy, 42, 32, 2).fill(BLUE)
    doc.roundedRect(gx + 4, gy + 4, 34, 24, 1).fill('#FFFFFF')
    doc.path(`M ${gx + 6} ${gy + 26} L ${gx + 17} ${gy + 13} L ${gx + 25} ${gy + 21} L ${gx + 30} ${gy + 16} L ${gx + 36} ${gy + 26} Z`).fill(BLUE)
    doc.circle(gx + 30, gy + 10, 2.6).fill(BLUE)
    flagIcon(doc, dx + 9, dy + 158, 7)
    doc.roundedRect(dx + 21, dy + 158, 60, 8, 2).lineWidth(0.5).stroke(BLUE_LINE)
    doc.font(F.light).fontSize(4.3).fill(BLUE).text('Behavior', dx + 25, dy + 160.3, { lineBreak: false })
    doc.font(F.light).fontSize(4.6).fill(BLUE)
    doc.text('Source social media platform', dx + dw / 2 - 45, dy - 42, { width: 90, align: 'center', lineBreak: false })
    doc.fontSize(3.8).text('(links to the original post when available)', dx + dw / 2 - 50, dy - 36, { width: 100, align: 'center', lineBreak: false })
    doc.moveTo(dx + dw / 2, dy - 30).lineTo(dx + dw / 2, dy - 9).lineWidth(0.4).stroke(BLUE)
    doc.fontSize(4.6).text('Post type: post,', 26, dy + 10, { lineBreak: false })
    doc.text('reply, or repost', 26, dy + 16, { lineBreak: false })
    doc.moveTo(70, dy + 17).lineTo(dx + 8, dy + 17).lineWidth(0.4).stroke(BLUE)
    doc.text('Analyst-confirmed', dx + dw + 14, dy + 158, { lineBreak: false })
    doc.text('behaviors', dx + dw + 14, dy + 164, { lineBreak: false })
    doc.moveTo(dx + 81, dy + 162).lineTo(dx + dw + 12, dy + 162).lineWidth(0.4).stroke(BLUE)
  }

  doc.font(F.medium).fontSize(12.5).fill(INK).text('Behavior Classifications*', 32, 434, { lineBreak: false })
  doc.font(F.regular).fontSize(8.4).fill('#222222').text('The following are the behaviors screened for in this report.', 32, 454, { width: 270, lineGap: 1.5 })
  const guideKeys = catKeys.filter((k) => GUIDE[k])
  const leftCount = Math.min(Math.max(0, guideKeys.length - 9), 4)
  const drawGuide = (keys: string[], gx: number, gy: number, width: number) => {
    for (const k of keys) {
      const g = GUIDE[k]
      dotIcon(doc, gx, gy + 1, 11)
      doc.font(F.semibold).fontSize(8.6).fill(INK).text(g.title, gx + 18, gy, { lineBreak: false })
      doc.font(F.regular).fontSize(7.9).fill('#222222').text(g.text, gx + 18, gy + 11, { width, lineGap: 0.6 })
      gy = doc.y + 9
    }
  }
  drawGuide(guideKeys.slice(0, leftCount), 32, 480, 262)
  drawGuide(guideKeys.slice(leftCount), 325, 205, 238)
  doc.font(F.light).fontSize(4.6).fill('#555555')
    .text('*The behavioral categories screened are set per screening by the end user. Categories not listed were not screened.', 32, 790, { lineBreak: false })

  // =================== FLAGGED POST PAGES ===================
  const SLOTS = [
    { x: 59, y: 163 }, { x: 309, y: 163 },
    { x: 59, y: 488 }, { x: 309, y: 488 },
  ]
  const CW = 228, CH = 281

  async function postCard(it: ReportItem, sx: number, sy: number) {
    doc.roundedRect(sx, sy, CW, CH, 9).lineWidth(0.8).stroke(BLUE_LINE)
    const mid = sx + CW / 2
    doc.rect(mid - 20, sy - 2, 40, 4).fill('#FFFFFF')
    platformIcon(doc, F, it.platform, mid, sy, 12.5)
    if (it.url) doc.link(mid - 10, sy - 8, 20, 16, it.url)

    const pt = postType(it.content_text)
    doc.roundedRect(sx + 11, sy + 19, 43, 13, 2.5).lineWidth(0.6).stroke(BLUE)
    doc.font(F.light).fontSize(7).fill(BLUE).text(pt.label, sx + 11, sy + 22.6, { width: 43, align: 'center', lineBreak: false })
    if (it.url) doc.link(sx + 11, sy + 19, 43, 13, it.url)
    doc.font(F.light).fontSize(5.8).fill('#A0A7B8')
      .text(fmtDate(it.posted_at), sx + CW - 111, sy + 23, { width: 100, align: 'right', lineBreak: false })

    let cy = sy + 42
    const hasImg = !!it.image
    if (pt.text && pt.text.trim()) {
      cy = richText(doc, F.regular, pt.text.trim(), sx + 11, cy, CW - 22, 7.6, 10.2, hasImg ? 5 : 16, keywordList)
      cy += 4
    }
    const footerY = sy + CH - 20
    const noteTop = footerY - (it.reviewer_note ? 22 : 0)
    if (hasImg) {
      const boxTop = cy + 2
      const boxH = Math.min(190, noteTop - boxTop - 8)
      if (boxH > 40) {
        doc.roundedRect(sx + 11, boxTop, CW - 22, boxH, 6).fill('#F1F1F1')
        const prepared = await prepareImage(it.image!, it.redact_image)
        if (prepared) {
          try {
            const meta = await sharp(prepared).metadata()
            const iw = meta.width || 1, ih = meta.height || 1
            const scale = Math.min((CW - 36) / iw, (boxH - 24) / ih)
            const w = iw * scale, h = ih * scale
            const ix = sx + 11 + (CW - 22 - w) / 2
            const iy = boxTop + (boxH - h) / 2
            doc.save()
            doc.roundedRect(ix, iy, w, h, 6).clip()
            doc.image(prepared, ix, iy, { width: w, height: h })
            doc.restore()
            if (it.redact_image) {
              doc.font(F.regular).fontSize(11).fill('#FFFFFF')
                .text('IMAGE REDACTED', ix, iy + h / 2 - 7, { width: w, align: 'center', lineBreak: false })
            }
          } catch { /* unembeddable image — leave the gray box */ }
        }
      }
    }
    if (it.reviewer_note) {
      doc.font(F.regular).fontSize(5.8).fill(MUTED)
        .text(`Analyst note: ${it.reviewer_note}`, sx + 11, noteTop, { width: CW - 22, height: 16, lineGap: 0.8, ellipsis: true })
    }
    if (it.final_flags.some((f) => f.category === 'keywords')) flagIcon(doc, sx + 12, footerY - 1, 7.5)
    else dotIcon(doc, sx + 11, footerY - 1.5, 8.5)
    const labels = Array.from(new Set(it.final_flags.map((f) => REPORT_LABELS[f.category] || f.category.toUpperCase())))
    doc.font(F.semibold).fontSize(5.8).fill(BLUE)
      .text(labels.join(', '), sx + 25, footerY, { width: CW - 36, lineBreak: false, ellipsis: true })
  }

  const postPageHeader = (title: string) => {
    topBar(doc)
    avatar(doc, F, name, 70, 107, 37)
    fitLine(doc, F.bold, name, 122, 76, 440, 26, INK)
    doc.font(F.regular).fontSize(15).fill(BLUE).text(title, 122, 114, { lineBreak: false })
  }

  async function postSection(title: string, list: ReportItem[]) {
    for (let i = 0; i < list.length; i += 4) {
      newPage('lightRight')
      postPageHeader(title)
      const page = list.slice(i, i + 4)
      for (let j = 0; j < page.length; j++) await postCard(page[j], SLOTS[j].x, SLOTS[j].y)
    }
  }

  if (items.length) {
    await postSection('FLAGGED POSTS', items)
    if (keywordItems.length) await postSection('KEYWORD FLAGGED POSTS', keywordItems)
  } else {
    newPage('lightRight')
    postPageHeader('FLAGGED POSTS')
    doc.font(F.regular).fontSize(10).fill(BODY).text(
      'No content matching the screened behavioral categories was identified within the lookback window.',
      59, 190, { width: 478 }
    )
  }

  // =================== FINAL PAGE: FCRA AND ACCURACY ===================
  newPage('none')
  doc.rect(0, 0, PAGE_W, 122).fill(NAVY)
  avatar(doc, F, name, 65, 62, 36, true)
  fitLine(doc, F.bold, name, 111, 36, 440, 24, '#FFFFFF')
  doc.font(F.regular).fontSize(14).fill('#FFFFFF').text('FCRA AND ACCURACY', 111, 68, { lineBreak: false })

  const TW = 531
  let fy = 156
  const ensure = (h: number) => {
    if (fy + h > PAGE_H - 40) {
      newPage('none')
      topBar(doc)
      fy = 48
    }
  }
  const heading = (t: string) => {
    ensure(40)
    doc.font(F.semibold).fontSize(8.3).fill('#2B3350').text(t, 32, fy, { lineBreak: false })
    fy += 15
  }
  const para = (t: string, opts: { bold?: boolean; link?: string } = {}) => {
    doc.font(opts.bold ? F.semibold : F.regular).fontSize(8.3)
    const h = doc.heightOfString(t, { width: TW, lineGap: 1.5 })
    ensure(h)
    doc.fill(opts.link ? '#2B3350' : '#4B5270')
      .text(t, 32, fy, { width: TW, lineGap: 1.5, link: opts.link, underline: !!opts.link })
    fy = doc.y + 9
  }
  para(FCRA_USER_NOTICE, { bold: true })
  para('To see your specific obligations under the Fair Credit Reporting Act (FCRA), please visit:')
  para(FTC_EMPLOYER_GUIDE_URL, { link: FTC_EMPLOYER_GUIDE_URL })
  para('A Summary of Your Rights Under the Fair Credit Reporting Act:')
  para(FCRA_SUMMARY_OF_RIGHTS_URL, { link: FCRA_SUMMARY_OF_RIGHTS_URL })
  fy += 4
  heading('NOTICE TO END USER:')
  for (const p of REPORT_COVER_NOTICE.split(/\n\s*\n/)) para(p.trim().replace(/^NOTICE TO END USER:\s*/i, ''))
  fy += 4
  heading('SCREENING RECORD:')
  para(
    `Screening ID ASP-${String(input.orderId).padStart(5, '0')}, prepared for ${input.clientName}${input.jobTitle ? ` (${input.jobTitle})` : ''}. ` +
    `The subject signed the disclosure and authorization as "${input.consent.signature_name}" on ${fmtDate(input.consent.signed_at)} (disclosure version ${input.consent.disclosure_version}). ` +
    `Every flagged item was individually reviewed and confirmed by a trained analyst; the review was signed off by ${input.signedOffByName} on ${fmtDate(input.signedOffAt)}.`
  )
  fy += 4
  heading('CONSUMER RIGHTS:')
  para(`The subject of this report has the right to dispute the accuracy or completeness of any information it contains by contacting ${COMPANY_NAME}. Disputed information will be reinvestigated free of charge, generally within 30 days.`)
  fy += 4
  heading('DISCLAIMER:')
  para(REPORT_DISCLAIMER)

  // =================== FOOTERS ===================
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    const f = footers[i]
    const n = i + 1
    if (f === 'darkRight') {
      doc.font(F.regular).fontSize(10).fill('#FFFFFF')
        .text(`CONFIDENTIAL PAGE ${n}`, 300, 812, { width: 238, align: 'right', lineBreak: false })
    } else if (f === 'lightRight') {
      doc.font(F.regular).fontSize(10).fill('#8A8A8A')
        .text(`CONFIDENTIAL PAGE ${n}`, 300, 808, { width: 252, align: 'right', lineBreak: false })
    } else if (f === 'insights') {
      doc.font(F.regular).fontSize(9.5).fill('#222222')
      doc.text('CONFIDENTIAL', 78, 793, { lineBreak: false })
      doc.text(String(n), 0, 793, { width: PAGE_W, align: 'center', lineBreak: false })
      doc.text(fmtDateTime(generatedAt), 300, 793, { width: 234, align: 'right', lineBreak: false })
    }
  }

  doc.end()
  return done
}
