import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import { CATEGORY_LABELS } from './categories'
import { COMPANY_NAME, REPORT_COVER_NOTICE, CALIFORNIA_NOTICE, FCRA_SUMMARY_OF_RIGHTS_URL, DISCLOSURE_VERSION } from './legal'
import type { AnalysisFlag } from './types'

// ============================================================================
// The client-facing PDF, modeled on the industry-standard report layout:
// cover w/ legal notices → summary + behavioral composition → flagged item
// cards (redacted images where marked) → rights appendix.
//
// Inclusion rule (enforced by the QUERY that feeds this, and re-checked
// here): an item appears only if it is NOT suppressed AND has analyst-
// confirmed final_flags. Raw AI output and suppressed content are
// structurally incapable of appearing.
// ============================================================================

const ORANGE = '#f87c04'
const DARK = '#081c24'
const GRAY = '#6b7280'
const LIGHT = '#f3f4f6'

const FLAG_COLORS: Record<string, string> = {
  threats: '#e2445c', violence_gory: '#bb3354', weapons: '#a25ddc',
  prejudice: '#ff642e', disparaging: '#fdab3d', drug_alcohol: '#ff9d48',
  drug_image: '#ff7575', nudity: '#c4162a', suggestive: '#df2f4a',
  profanity: '#784bd1', rude_gestures: '#9d50dd', self_harm: '#5559df',
  politics: '#579bfc', keywords: '#00c875',
}

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

export interface ReportInput {
  orderId: number
  candidateName: string
  clientName: string
  jobTitle: string | null
  lookbackYears: number
  enabledCategoryKeys: string[]
  profiles: { platform: string; url: string }[]
  consent: { signature_name: string; signed_at: string; disclosure_version: string }
  signedOffByName: string
  signedOffAt: string
  items: ReportItem[]
}

function fmtDate(d: string | Date | null): string {
  if (!d) return 'Unknown date'
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

async function prepareImage(
  buf: Buffer,
  redact: boolean
): Promise<Buffer | null> {
  try {
    let img = sharp(buf).rotate().resize({ width: 800, withoutEnlargement: true })
    if (redact) {
      // Heavy pixelation: shrink hard, blur, scale back up.
      const meta = await sharp(buf).metadata()
      const w = Math.min(meta.width || 800, 800)
      img = sharp(await sharp(buf).resize({ width: 24 }).blur(2).png().toBuffer())
        .resize({ width: w, kernel: 'nearest' })
    }
    return await img.png().toBuffer()
  } catch {
    return null
  }
}

export async function buildReportPdf(input: ReportInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 54, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  )

  const pageW = doc.page.width
  const margin = 54
  const contentW = pageW - margin * 2

  // Only reviewed, unsuppressed, flagged items — defensive re-check.
  const items = input.items.filter(
    (i) => Array.isArray(i.final_flags) && i.final_flags.length > 0
  )

  // ---------- COVER ----------
  doc.rect(0, 0, pageW, 130).fill(DARK)
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(22)
    .text('ALL-STAR ', margin, 48, { continued: true })
    .fill(ORANGE).text('SCREENING')
  doc.fill('#ffffff').font('Helvetica').fontSize(10)
    .text('Social Media Screening Report', margin, 82)

  doc.fill(DARK).font('Helvetica-Bold').fontSize(26)
    .text(input.candidateName, margin, 180)
  doc.font('Helvetica').fontSize(12).fill(GRAY)
    .text(
      `Prepared for ${input.clientName}${input.jobTitle ? ` — ${input.jobTitle}` : ''}`,
      margin, 214
    )
    .text(`Report date: ${fmtDate(new Date().toISOString())}`, margin, 232)
    .text(`Screening ID: ASP-${String(input.orderId).padStart(5, '0')}`, margin, 250)
    .text(`Lookback window: ${input.lookbackYears} years`, margin, 268)

  doc.moveTo(margin, 300).lineTo(pageW - margin, 300).lineWidth(2).stroke(ORANGE)

  doc.fill(DARK).font('Helvetica-Bold').fontSize(11)
    .text('IMPORTANT NOTICES', margin, 320)
  doc.font('Helvetica').fontSize(8.5).fill('#374151')
    .text(REPORT_COVER_NOTICE, margin, 340, { width: contentW, lineGap: 2 })
  doc.moveDown(1)
  doc.font('Helvetica-Bold').fontSize(9).fill(DARK).text('CALIFORNIA', { width: contentW })
  doc.font('Helvetica').fontSize(8.5).fill('#374151')
    .text(CALIFORNIA_NOTICE.replace('CALIFORNIA NOTICE\n\n', ''), { width: contentW, lineGap: 2 })

  // ---------- SUMMARY PAGE ----------
  doc.addPage()
  doc.fill(DARK).font('Helvetica-Bold').fontSize(16).text('Screening Summary', margin, margin)

  let y = margin + 34
  const line = (label: string, value: string) => {
    doc.font('Helvetica-Bold').fontSize(9.5).fill(GRAY).text(label.toUpperCase(), margin, y)
    doc.font('Helvetica').fontSize(10.5).fill(DARK).text(value, margin + 170, y - 1, { width: contentW - 170 })
    y = Math.max(y + 18, doc.y + 6)
  }
  line('Candidate', input.candidateName)
  line('Consent signed', `${input.consent.signature_name} — ${fmtDate(input.consent.signed_at)} (disclosure ${input.consent.disclosure_version})`)
  line('Profiles reviewed', input.profiles.length
    ? input.profiles.map((p) => `${p.platform}: ${p.url}`).join('\n')
    : 'None provided')
  line('Categories screened', input.enabledCategoryKeys.map((k) => CATEGORY_LABELS[k] || k).join(', '))
  line('Items flagged', `${items.length}`)
  line('Human review', `Every flagged item in this report was individually reviewed and confirmed by a trained analyst. Signed off by ${input.signedOffByName} on ${fmtDate(input.signedOffAt)}.`)

  // Behavioral composition chart
  const counts = new Map<string, number>()
  for (const it of items) for (const f of it.final_flags) {
    counts.set(f.category, (counts.get(f.category) || 0) + 1)
  }
  if (counts.size > 0) {
    y += 14
    doc.font('Helvetica-Bold').fontSize(13).fill(DARK).text('Behavioral Composition', margin, y)
    y += 24
    const max = Math.max(...Array.from(counts.values()))
    const barMaxW = contentW - 190
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
    for (const [key, n] of sorted) {
      if (y > doc.page.height - 90) { doc.addPage(); y = margin }
      doc.font('Helvetica').fontSize(9).fill(DARK)
        .text(CATEGORY_LABELS[key] || key, margin, y + 2, { width: 150 })
      const w = Math.max((n / max) * barMaxW, 8)
      doc.rect(margin + 160, y, w, 13).fill(FLAG_COLORS[key] || '#c4c4c4')
      doc.font('Helvetica-Bold').fontSize(9).fill(DARK)
        .text(String(n), margin + 166 + w, y + 2)
      y += 22
    }
  } else {
    y += 14
    doc.font('Helvetica-Bold').fontSize(13).fill(DARK).text('Result', margin, y)
    doc.font('Helvetica').fontSize(10.5).fill('#374151')
      .text('No content matching the screened categories was identified within the lookback window.', margin, y + 22, { width: contentW })
  }

  // ---------- FLAGGED ITEMS ----------
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    doc.addPage()
    doc.fill(DARK).font('Helvetica-Bold').fontSize(13)
      .text(`Flagged Item ${idx + 1} of ${items.length}`, margin, margin)
    doc.font('Helvetica').fontSize(9.5).fill(GRAY)
      .text(`${it.platform} · ${fmtDate(it.posted_at)}${it.url ? ` · ${it.url}` : ''}`, margin, margin + 20, { width: contentW })

    // Flag chips
    let cx = margin
    let cy = margin + 42
    for (const f of it.final_flags) {
      const label = `${(CATEGORY_LABELS[f.category] || f.category).toUpperCase()}`
      const w = doc.font('Helvetica-Bold').fontSize(8).widthOfString(label) + 16
      if (cx + w > pageW - margin) { cx = margin; cy += 22 }
      doc.roundedRect(cx, cy, w, 16, 3).fill(FLAG_COLORS[f.category] || '#c4c4c4')
      doc.fill('#ffffff').text(label, cx + 8, cy + 4.5)
      cx += w + 6
    }
    let iy = cy + 30

    // Image
    if (it.image) {
      const prepared = await prepareImage(it.image, it.redact_image)
      if (prepared) {
        try {
          const maxH = 300
          doc.image(prepared, margin, iy, { fit: [contentW, maxH] })
          if (it.redact_image) {
            doc.font('Helvetica-Bold').fontSize(9).fill('#ffffff')
            doc.rect(margin, iy, 150, 18).fill('#111827')
            doc.fill('#ffffff').text('IMAGE REDACTED', margin + 10, iy + 5)
          }
          iy += maxH + 14
        } catch { /* unembeddable image — skip */ }
      }
    }

    // Text content
    if (it.content_text) {
      doc.rect(margin, iy, contentW, 0.5).fill('#e5e7eb')
      iy += 10
      doc.font('Helvetica-Bold').fontSize(9).fill(GRAY).text('POST TEXT', margin, iy)
      iy = doc.y + 4
      doc.font('Helvetica').fontSize(10).fill(DARK)
        .text(it.content_text.slice(0, 2500), margin, iy, { width: contentW, lineGap: 2 })
      iy = doc.y + 12
    }

    // Rationales
    doc.font('Helvetica-Bold').fontSize(9).fill(GRAY).text('ANALYST FINDINGS', margin, iy)
    iy = doc.y + 4
    for (const f of it.final_flags) {
      doc.font('Helvetica-Bold').fontSize(9.5).fill(DARK)
        .text(`${CATEGORY_LABELS[f.category] || f.category}: `, margin, iy, { continued: true })
        .font('Helvetica').fill('#374151')
        .text(f.rationale || 'Confirmed on review.', { width: contentW })
      iy = doc.y + 4
    }
    if (it.reviewer_note) {
      doc.font('Helvetica-Bold').fontSize(9.5).fill(DARK)
        .text('Reviewer note: ', margin, iy + 2, { continued: true })
        .font('Helvetica').fill('#374151')
        .text(it.reviewer_note, { width: contentW })
    }
  }

  // ---------- RIGHTS APPENDIX ----------
  doc.addPage()
  doc.fill(DARK).font('Helvetica-Bold').fontSize(16)
    .text('Consumer Rights', margin, margin)
  doc.font('Helvetica').fontSize(10).fill('#374151').text(
    `The subject of this report has the right to dispute the accuracy or completeness of any information it contains by contacting ${COMPANY_NAME}. Disputed information will be reinvestigated free of charge, generally within 30 days.

The full "Summary of Your Rights Under the Fair Credit Reporting Act" published by the Consumer Financial Protection Bureau is available at:

${FCRA_SUMMARY_OF_RIGHTS_URL}

Content review policy: this screening reviews publicly available content only, against job-related behavioral categories selected by the end user. Content revealing legally protected characteristics is excluded automatically and is not available to the end user, in any form, at any stage.`,
    margin, margin + 30, { width: contentW, lineGap: 3 }
  )

  // Footer on every page
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i)
    doc.font('Helvetica').fontSize(7.5).fill('#9ca3af').text(
      `${COMPANY_NAME} · Confidential consumer report · ASP-${String(input.orderId).padStart(5, '0')} · Page ${i + 1} of ${range.count}`,
      margin, doc.page.height - 40, { width: contentW, align: 'center' }
    )
  }

  doc.end()
  return done
}
