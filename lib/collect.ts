import { sql } from './db'
import { audit } from './audit'
import type { CollectionProfileResult } from './types'

// ============================================================================
// Automated content collection.
//
// After a candidate authorizes their profiles, this walks each PUBLIC
// profile the way any logged-out visitor could, pulls recent posts within
// the lookback window, and files them into the capture workspace as
// content items (source='auto') — then analysis runs over them.
//
// Design lines that keep this defensible:
//   - Candidate-authorized profile URLs only. Nothing is discovered.
//   - Logged-out access only. No credentials, no login automation, no
//     CAPTCHA circumvention. Where a platform shows a login wall to the
//     public (Facebook, Instagram, X do), we say so honestly in the run
//     log instead of sneaking around it — that's what the manual capture
//     workspace is for.
//   - Everything collected flows through the same suppression filter and
//     human review as manual captures. Auto-collection adds items, never
//     conclusions.
//
// Per-platform reality (2026): Reddit exposes public JSON; YouTube exposes
// RSS; blogs/most sites are plain HTML; TikTok sometimes server-renders
// profile data; Facebook/Instagram/X wall off logged-out visitors almost
// entirely.
// ============================================================================

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const FETCH_TIMEOUT_MS = 15000
const MAX_ITEMS_PER_PROFILE = 25
const MAX_ITEMS_PER_ORDER = 80
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export interface CollectedPost {
  url: string | null
  postedAt: string | null // ISO date
  text: string | null
  imageUrl: string | null
}

async function fetchWithTimeout(url: string, accept = 'text/html'): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: accept + ',*/*;q=0.8' },
    })
  } finally {
    clearTimeout(t)
  }
}

function withinLookback(iso: string | null, lookbackYears: number): boolean {
  if (!iso) return true // undated content is kept; the analyst can judge
  const cutoff = Date.now() - lookbackYears * 365.25 * 24 * 3600 * 1000
  return new Date(iso).getTime() >= cutoff
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------- Reddit (public JSON API) ----------------

export function redditUsernameFromUrl(url: string): string | null {
  const m = url.match(/reddit\.com\/(?:user|u)\/([A-Za-z0-9_-]+)/i)
  return m ? m[1] : null
}

export function parseRedditListing(json: any, lookbackYears: number): CollectedPost[] {
  const out: CollectedPost[] = []
  const children = json?.data?.children || []
  for (const c of children) {
    const d = c?.data
    if (!d) continue
    const postedAt = d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null
    if (!withinLookback(postedAt, lookbackYears)) continue
    if (c.kind === 't3') {
      // a post
      const text = [d.title, d.selftext].filter(Boolean).join('\n').trim()
      const img =
        typeof d.url_overridden_by_dest === 'string' &&
        /\.(png|jpe?g|webp|gif)(\?|$)/i.test(d.url_overridden_by_dest)
          ? d.url_overridden_by_dest
          : null
      if (text || img) {
        out.push({
          url: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
          postedAt,
          text: text || null,
          imageUrl: img,
        })
      }
    } else if (c.kind === 't1' && d.body) {
      // a comment
      out.push({
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
        postedAt,
        text: `(comment in r/${d.subreddit}): ${d.body}`.trim(),
        imageUrl: null,
      })
    }
  }
  return out
}

async function collectReddit(url: string, lookbackYears: number): Promise<CollectedPost[]> {
  const user = redditUsernameFromUrl(url)
  if (!user) throw new Error('unrecognized reddit profile URL')
  const posts: CollectedPost[] = []
  for (const feed of ['submitted', 'comments']) {
    try {
      const res = await fetchWithTimeout(
        `https://www.reddit.com/user/${user}/${feed}.json?limit=40&raw_json=1`,
        'application/json'
      )
      if (!res.ok) continue
      posts.push(...parseRedditListing(await res.json(), lookbackYears))
    } catch { /* one feed failing shouldn't kill the other */ }
  }
  return posts
}

// ---------------- YouTube (public RSS) ----------------

export function extractYoutubeChannelId(html: string): string | null {
  const m =
    html.match(/"channelId":"(UC[\w-]{20,})"/) ||
    html.match(/channel_id=(UC[\w-]{20,})/)
  return m ? m[1] : null
}

export function parseYoutubeRss(xml: string, lookbackYears: number): CollectedPost[] {
  const out: CollectedPost[] = []
  const entries = xml.split('<entry>').slice(1)
  for (const e of entries) {
    const grab = (tag: string) => {
      const m = e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
      return m ? m[1].trim() : null
    }
    const title = grab('title')
    const published = grab('published')
    const link = e.match(/<link rel="alternate" href="([^"]+)"/)?.[1] || null
    const desc = grab('media:description')
    const thumb = e.match(/<media:thumbnail url="([^"]+)"/)?.[1] || null
    if (!withinLookback(published, lookbackYears)) continue
    if (title || desc) {
      out.push({
        url: link,
        postedAt: published,
        text: [title, desc ? desc.slice(0, 1500) : null].filter(Boolean).join('\n'),
        imageUrl: thumb,
      })
    }
  }
  return out
}

async function collectYoutube(url: string, lookbackYears: number): Promise<CollectedPost[]> {
  let channelId = url.match(/youtube\.com\/channel\/(UC[\w-]{20,})/)?.[1] || null
  if (!channelId) {
    const page = await fetchWithTimeout(url)
    if (page.ok) channelId = extractYoutubeChannelId(await page.text())
  }
  if (!channelId) throw new Error('could not resolve YouTube channel id')
  const rss = await fetchWithTimeout(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    'application/xml'
  )
  if (!rss.ok) throw new Error(`RSS fetch failed (${rss.status})`)
  return parseYoutubeRss(await rss.text(), lookbackYears)
}

// ---------------- TikTok (server-rendered JSON, when present) ----------------

export function parseTiktokUniversalData(html: string, lookbackYears: number): CollectedPost[] {
  const m = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  )
  if (!m) return []
  try {
    const data = JSON.parse(m[1])
    const scope = data?.__DEFAULT_SCOPE__ || {}
    const userDetail = scope['webapp.user-detail']
    const items: any[] =
      scope['webapp.user-post']?.itemList ||
      userDetail?.itemList ||
      []
    const out: CollectedPost[] = []
    for (const it of items) {
      const postedAt = it.createTime ? new Date(it.createTime * 1000).toISOString() : null
      if (!withinLookback(postedAt, lookbackYears)) continue
      if (it.desc) {
        out.push({
          url: it.id && it.author ? `https://www.tiktok.com/@${typeof it.author === 'string' ? it.author : it.author.uniqueId}/video/${it.id}` : null,
          postedAt,
          text: it.desc,
          imageUrl: it.video?.cover || null,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

async function collectTiktok(url: string, lookbackYears: number): Promise<CollectedPost[]> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`profile fetch failed (${res.status})`)
  return parseTiktokUniversalData(await res.text(), lookbackYears)
}

// ---------------- Generic page / blog ----------------

async function collectGeneric(url: string): Promise<CollectedPost[]> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`fetch failed (${res.status})`)
  const html = await res.text()
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null
  const ogImage = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1] || null
  const body = stripTags(html).slice(0, 6000)
  if (!body && !ogImage) return []
  return [{
    url,
    postedAt: null,
    text: [title, body].filter(Boolean).join('\n').slice(0, 8000) || null,
    imageUrl: ogImage,
  }]
}

// ---------------- Walled platforms ----------------

function loginWallDetected(html: string, host: string): boolean {
  const h = html.toLowerCase()
  if (host.includes('facebook.com')) return h.includes('login') && !h.includes('"story"')
  if (host.includes('instagram.com')) return h.includes('loginform') || h.includes('/accounts/login')
  if (host.includes('x.com') || host.includes('twitter.com')) return true
  return false
}

// ---------------- Orchestration ----------------

function platformFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('reddit.com')) return 'Reddit'
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube'
    if (host.includes('tiktok.com')) return 'TikTok'
    if (host.includes('facebook.com')) return 'Facebook'
    if (host.includes('instagram.com')) return 'Instagram'
    if (host.includes('x.com') || host.includes('twitter.com')) return 'X (Twitter)'
    if (host.includes('linkedin.com')) return 'LinkedIn'
    if (host.includes('pinterest.')) return 'Pinterest'
    if (host.includes('threads.net')) return 'Threads'
    return host
  } catch {
    return 'Other'
  }
}

async function downloadImage(url: string): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const res = await fetchWithTimeout(url, 'image/*')
    if (!res.ok) return null
    const mime = res.headers.get('content-type')?.split(';')[0] || ''
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null
    return { buf, mime }
  } catch {
    return null
  }
}

async function collectProfile(
  url: string,
  lookbackYears: number
): Promise<{ posts: CollectedPost[]; status: CollectionProfileResult['status']; note: string }> {
  const platform = platformFromUrl(url)
  try {
    if (platform === 'Reddit') {
      const posts = await collectReddit(url, lookbackYears)
      return posts.length
        ? { posts, status: 'collected', note: `${posts.length} public posts/comments via Reddit's public API` }
        : { posts, status: 'empty', note: 'No public posts within the lookback window' }
    }
    if (platform === 'YouTube') {
      const posts = await collectYoutube(url, lookbackYears)
      return posts.length
        ? { posts, status: 'collected', note: `${posts.length} recent public videos via channel RSS` }
        : { posts, status: 'empty', note: 'No recent public videos' }
    }
    if (platform === 'TikTok') {
      const posts = await collectTiktok(url, lookbackYears)
      return posts.length
        ? { posts, status: 'collected', note: `${posts.length} public videos from the profile page` }
        : { posts: [], status: 'walled', note: 'TikTok served no public post data to a logged-out visitor — capture manually' }
    }
    if (['Facebook', 'Instagram', 'X (Twitter)', 'LinkedIn', 'Threads'].includes(platform)) {
      // Try honestly, expect the wall, say so.
      try {
        const res = await fetchWithTimeout(url)
        const html = res.ok ? await res.text() : ''
        if (!res.ok || loginWallDetected(html, new URL(url).hostname)) {
          return { posts: [], status: 'walled', note: `${platform} shows a login wall to logged-out visitors — public content must be captured manually` }
        }
        // Rare: some content actually public — grab what the page gives us.
        const generic = await collectGeneric(url)
        return generic.length
          ? { posts: generic, status: 'collected', note: 'Captured the publicly served page content' }
          : { posts: [], status: 'walled', note: `${platform} served no public content — capture manually` }
      } catch {
        return { posts: [], status: 'walled', note: `${platform} blocked logged-out access — capture manually` }
      }
    }
    // Blogs, personal sites, anything else
    const posts = await collectGeneric(url)
    return posts.length
      ? { posts, status: 'collected', note: 'Captured the public page content' }
      : { posts, status: 'empty', note: 'Page had no extractable content' }
  } catch (err: any) {
    return { posts: [], status: 'error', note: String(err?.message || err).slice(0, 200) }
  }
}

// Runs collection for every profile on an order, files items, records the
// run. Returns the per-profile results.
export async function collectForOrder(
  orderId: number,
  triggeredBy: string
): Promise<CollectionProfileResult[]> {
  const orders = (await sql`
    SELECT id, status, lookback_years FROM orders WHERE id = ${orderId}
  `) as any[]
  const order = orders[0]
  if (!order) throw new Error('Order not found')
  if (['draft', 'consent_sent', 'cancelled'].includes(order.status)) {
    throw new Error('Collection requires completed consent')
  }

  const runRows = (await sql`
    INSERT INTO collection_runs (order_id, triggered_by) VALUES (${orderId}, ${triggeredBy})
    RETURNING id
  `) as any[]
  const runId = runRows[0].id
  await audit(triggeredBy, 'collection.started', orderId)

  const profiles = (await sql`
    SELECT platform, url FROM candidate_profiles WHERE order_id = ${orderId} ORDER BY created_at
  `) as { platform: string; url: string }[]

  // Don't double-collect: skip URLs already captured on this order.
  const existing = (await sql`
    SELECT url FROM content_items WHERE order_id = ${orderId} AND url IS NOT NULL
  `) as { url: string }[]
  const seen = new Set(existing.map((e) => e.url))

  const results: CollectionProfileResult[] = []
  let totalInserted = ((await sql`
    SELECT COUNT(*)::int AS n FROM content_items WHERE order_id = ${orderId}
  `) as any[])[0].n

  for (const p of profiles) {
    const platform = platformFromUrl(p.url)
    const { posts, status, note } = await collectProfile(p.url, order.lookback_years)
    let inserted = 0
    for (const post of posts.slice(0, MAX_ITEMS_PER_PROFILE)) {
      if (totalInserted >= MAX_ITEMS_PER_ORDER) break
      if (post.url && seen.has(post.url)) continue
      const img = post.imageUrl ? await downloadImage(post.imageUrl) : null
      if (!post.text && !img) continue
      await sql`
        INSERT INTO content_items
          (order_id, platform, url, posted_at, content_text, image, image_mime, captured_by, source)
        VALUES
          (${orderId}, ${platform}, ${post.url}, ${post.postedAt ? post.postedAt.slice(0, 10) : null},
           ${post.text ? post.text.slice(0, 10000) : null}, ${img?.buf ?? null}, ${img?.mime ?? null},
           ${null}, 'auto')
      `
      if (post.url) seen.add(post.url)
      inserted++
      totalInserted++
    }
    results.push({ url: p.url, platform, status, items: inserted, note })
  }

  // First collected item moves the screening forward.
  if (order.status === 'consent_completed' && totalInserted > 0) {
    await sql`UPDATE orders SET status = 'collecting', updated_at = NOW() WHERE id = ${orderId}`
  }
  await sql`
    UPDATE collection_runs SET results = ${JSON.stringify(results)}, finished_at = NOW()
    WHERE id = ${runId}
  `
  await audit(triggeredBy, 'collection.finished', orderId, {
    profiles: results.length,
    collected: results.reduce((a, r) => a + r.items, 0),
    walled: results.filter((r) => r.status === 'walled').length,
  })
  return results
}
