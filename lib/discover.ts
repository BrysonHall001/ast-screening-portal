import { sql } from './db'
import { audit } from './audit'

// ============================================================================
// Profile discovery: given the candidate's name, email, and optional
// location, find social profiles that PROBABLY belong to them.
//
// Two techniques:
//   1. Web search (DuckDuckGo's HTML endpoint — no API key needed) with
//      per-platform site: queries built from the candidate's name.
//   2. Handle probing: the email's local part (jane.doe99@… → "janedoe99")
//      is checked for existence on platforms with reliable public
//      handle URLs.
//
// CRITICAL DESIGN LINE: discovery output is SUGGESTIONS with evidence and
// a score — never automatically screened. A human confirms each match
// before it becomes a candidate_profile. Same-name misattribution is the
// canonical FCRA accuracy failure; the confirmation step is the defense,
// and every confirm/reject is audited with who and when.
// ============================================================================

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const TIMEOUT_MS = 8000

const SEARCH_BASE = () =>
  (process.env.DISCOVERY_SEARCH_BASE || 'https://html.duckduckgo.com').replace(/\/$/, '')

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

export interface Suggestion {
  platform: string
  url: string
  evidence: string
  score: number
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8' },
    })
  } finally {
    clearTimeout(t)
  }
}

// ---------------- DuckDuckGo HTML parsing ----------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

export function parseDdgHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = []
  // Each result: <a rel="nofollow" class="result__a" href="...">Title</a>
  // ... <a class="result__snippet" ...>snippet</a>
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  const links: { url: string; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html))) {
    let url = decodeEntities(m[1])
    // DDG wraps destinations as //duckduckgo.com/l/?uddg=<encoded>
    const uddg = url.match(/[?&]uddg=([^&]+)/)
    if (uddg) url = decodeURIComponent(uddg[1])
    if (!/^https?:\/\//i.test(url)) continue
    links.push({ url, title: decodeEntities(m[2].replace(/<[^>]+>/g, '')) })
  }
  const snippets: string[] = []
  while ((m = snippetRe.exec(html))) {
    snippets.push(decodeEntities(m[1].replace(/<[^>]+>/g, '')))
  }
  for (let i = 0; i < links.length; i++) {
    hits.push({ ...links[i], snippet: snippets[i] || '' })
  }
  return hits
}

// ---------------- Brave Search API (reliable from server IPs) ----------------

export function parseBraveResults(json: any): SearchHit[] {
  const results = json?.web?.results || []
  return results
    .filter((r: any) => typeof r?.url === 'string')
    .map((r: any) => ({
      title: String(r.title || ''),
      url: String(r.url),
      snippet: String(r.description || '').replace(/<[^>]+>/g, ''),
    }))
}

async function braveSearch(query: string): Promise<SearchHit[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (!key) return []
  try {
    const base = (process.env.BRAVE_SEARCH_BASE || 'https://api.search.brave.com').replace(/\/$/, '')
    const res = await fetchWithTimeout2(
      `${base}/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
      { 'X-Subscription-Token': key, Accept: 'application/json' }
    )
    if (!res.ok) return []
    return parseBraveResults(await res.json()).slice(0, 8)
  } catch {
    return []
  }
}

async function fetchWithTimeout2(url: string, headers: Record<string, string>): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, ...headers } })
  } finally {
    clearTimeout(t)
  }
}

// Provider selection: Brave when a key is configured (works reliably from
// datacenter IPs like Render's), DuckDuckGo's HTML endpoint otherwise
// (fine from residential IPs, often BLOCKED from cloud servers — which is
// why the Brave key matters in production).
async function searchWeb(query: string): Promise<SearchHit[]> {
  if (process.env.BRAVE_SEARCH_API_KEY) return braveSearch(query)
  return ddgSearch(query)
}

async function ddgSearch(query: string): Promise<SearchHit[]> {
  try {
    const res = await fetchWithTimeout(
      `${SEARCH_BASE()}/html/?q=${encodeURIComponent(query)}`
    )
    if (!res.ok) return []
    return parseDdgHtml(await res.text()).slice(0, 6)
  } catch {
    return []
  }
}

// ---------------- Scoring ----------------

export function scoreHit(
  hit: SearchHit,
  nameTokens: string[],
  emailLocal: string,
  location: string | null
): { score: number; evidence: string[] } {
  const hay = `${hit.title} ${hit.snippet}`.toLowerCase()
  const urlLower = hit.url.toLowerCase()
  let score = 0
  const evidence: string[] = []
  const matched = nameTokens.filter((t) => hay.includes(t))
  if (matched.length === nameTokens.length && nameTokens.length >= 2) {
    score += 3
    evidence.push('full name appears in the result')
  } else if (matched.length > 0) {
    score += matched.length
    evidence.push(`name partially matches (${matched.join(', ')})`)
  }
  const compact = nameTokens.join('')
  if (compact.length >= 6 && urlLower.includes(compact)) {
    score += 2
    evidence.push('profile URL contains the candidate name')
  }
  if (emailLocal.length >= 5 && urlLower.includes(emailLocal)) {
    score += 3
    evidence.push('profile URL matches the email handle')
  }
  if (location) {
    const locToken = location.toLowerCase().split(/[,\s]+/)[0]
    if (locToken && locToken.length >= 3 && hay.includes(locToken)) {
      score += 2
      evidence.push(`location "${location}" appears in the result`)
    }
  }
  return { score, evidence }
}

function normalizeEmailLocal(email: string): string {
  return (email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function platformOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('facebook.com')) return 'Facebook'
    if (host.includes('instagram.com')) return 'Instagram'
    if (host.includes('linkedin.com')) return 'LinkedIn'
    if (host.includes('x.com') || host.includes('twitter.com')) return 'X (Twitter)'
    if (host.includes('tiktok.com')) return 'TikTok'
    if (host.includes('reddit.com')) return 'Reddit'
    if (host.includes('youtube.com')) return 'YouTube'
    if (host.includes('pinterest.')) return 'Pinterest'
    if (host.includes('threads.net')) return 'Threads'
    return 'Other'
  } catch {
    return 'Other'
  }
}

// Only keep results that look like PROFILE pages, not random posts/articles.
export function looksLikeProfileUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '')
    const segs = path.split('/').filter(Boolean)
    if (host.includes('facebook.com')) return segs.length === 1 && !['share', 'groups', 'events', 'pages', 'watch', 'reel'].includes(segs[0])
    if (host.includes('instagram.com')) return segs.length === 1 && !['p', 'reel', 'explore', 'accounts'].includes(segs[0])
    if (host.includes('linkedin.com')) return segs[0] === 'in' && segs.length === 2
    if (host.includes('x.com') || host.includes('twitter.com')) return segs.length === 1 && !['search', 'i', 'home', 'hashtag'].includes(segs[0])
    if (host.includes('tiktok.com')) return segs.length === 1 && segs[0]?.startsWith('@')
    if (host.includes('reddit.com')) return (segs[0] === 'user' || segs[0] === 'u') && segs.length === 2
    if (host.includes('youtube.com')) return (segs[0]?.startsWith('@') && segs.length === 1) || (segs[0] === 'channel' && segs.length === 2)
    return false
  } catch {
    return false
  }
}

// ---------------- Handle probing ----------------

async function probeHandles(emailLocal: string): Promise<Suggestion[]> {
  if (emailLocal.length < 5) return []
  const out: Suggestion[] = []
  const probes: Promise<void>[] = []
  probes.push((async () => {
    try {
      const r = await fetchWithTimeout(`https://www.reddit.com/user/${emailLocal}/about.json`)
      if (r.ok) out.push({ platform: 'Reddit', url: `https://www.reddit.com/user/${emailLocal}`, evidence: `a Reddit account named "${emailLocal}" (the candidate's email handle) exists`, score: 3 })
    } catch { /* unreachable ≠ nonexistent */ }
  })())
  probes.push((async () => {
    try {
      const r = await fetchWithTimeout(`https://www.youtube.com/@${emailLocal}`)
      if (r.ok) out.push({ platform: 'YouTube', url: `https://www.youtube.com/@${emailLocal}`, evidence: `a YouTube channel @${emailLocal} (the candidate's email handle) exists`, score: 3 })
    } catch { /* skip */ }
  })())
  probes.push((async () => {
    try {
      const r = await fetchWithTimeout(`https://www.tiktok.com/@${emailLocal}`)
      if (r.ok) out.push({ platform: 'TikTok', url: `https://www.tiktok.com/@${emailLocal}`, evidence: `a TikTok account @${emailLocal} (the candidate's email handle) exists`, score: 2 })
    } catch { /* skip */ }
  })())
  await Promise.all(probes)
  return out
}

// ---------------- Orchestration ----------------

const DISCOVERY_MAX_MS = 120000

export async function discoverForOrder(
  orderId: number,
  actor: string
): Promise<Suggestion[]> {
  // Watchdog wrapper: whatever happens inside, the run ends with either
  // discovery.finished or discovery.failed in the audit log — never silence.
  let timer: any
  try {
    return await Promise.race([
      discoverForOrderInner(orderId, actor),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error('discovery timed out after 120s')), DISCOVERY_MAX_MS)
      }),
    ])
  } catch (err: any) {
    await audit(actor, 'discovery.failed', orderId, {
      error: String(err?.message || err).slice(0, 300),
    })
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function discoverForOrderInner(
  orderId: number,
  actor: string
): Promise<Suggestion[]> {
  const orders = (await sql`
    SELECT candidate_name, candidate_email, candidate_location, status
    FROM orders WHERE id = ${orderId}
  `) as any[]
  const order = orders[0]
  if (!order) throw new Error('Order not found')
  if (['draft', 'consent_sent', 'cancelled'].includes(order.status)) {
    throw new Error('Discovery requires completed consent')
  }
  await audit(actor, 'discovery.started', orderId)

  const name = String(order.candidate_name || '').trim()
  const nameTokens = name.toLowerCase().split(/\s+/).filter((t: string) => t.length > 1)
  const emailLocal = normalizeEmailLocal(order.candidate_email || '')
  const location = order.candidate_location || null

  const quoted = `"${name}"`
  const loc = location ? ` ${location}` : ''
  const queries = [
    `${quoted}${loc} site:facebook.com`,
    `${quoted}${loc} site:instagram.com`,
    `${quoted}${loc} site:linkedin.com/in`,
    `${quoted}${loc} site:x.com OR site:twitter.com`,
    `${quoted}${loc} site:tiktok.com`,
    `${quoted} site:reddit.com`,
    `${quoted} site:youtube.com`,
  ]

  const byUrl = new Map<string, Suggestion>()
  for (const q of queries) {
    const hits = await searchWeb(q)
    for (const hit of hits) {
      if (!looksLikeProfileUrl(hit.url)) continue
      const { score, evidence } = scoreHit(hit, nameTokens, emailLocal, location)
      if (score < 2) continue
      const url = hit.url.replace(/\/+$/, '')
      const existing = byUrl.get(url)
      if (!existing || existing.score < score) {
        byUrl.set(url, {
          platform: platformOf(url),
          url,
          evidence: evidence.join('; ') + ` — found searching: ${q.replace(/ site:.*/, '')}`,
          score,
        })
      }
    }
  }
  for (const s of await probeHandles(emailLocal)) {
    const url = s.url.replace(/\/+$/, '')
    const existing = byUrl.get(url)
    if (!existing || existing.score < s.score) byUrl.set(url, s)
  }

  // Don't suggest what's already an attached profile.
  const attached = (await sql`
    SELECT url FROM candidate_profiles WHERE order_id = ${orderId}
  `) as { url: string }[]
  const attachedSet = new Set(attached.map((a) => a.url.replace(/\/+$/, '')))

  const suggestions = Array.from(byUrl.values())
    .filter((s) => !attachedSet.has(s.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  for (const s of suggestions) {
    await sql`
      INSERT INTO discovered_profiles (order_id, platform, url, evidence, score)
      VALUES (${orderId}, ${s.platform}, ${s.url}, ${s.evidence}, ${s.score})
      ON CONFLICT (order_id, url) DO UPDATE SET
        evidence = EXCLUDED.evidence, score = EXCLUDED.score
    `
  }
  await audit(actor, 'discovery.finished', orderId, {
    suggestions: suggestions.length,
  })
  return suggestions
}
