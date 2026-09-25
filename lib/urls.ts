// Make a user-typed link safe to store and click.
//   "facebook.com/jane"      → "https://facebook.com/jane"
//   "  www.x.com/jane  "     → "https://www.x.com/jane"
//   "@jane" / "javascript:…" → null (not a web link)
// Without the https:// a browser treats a link as a page on OUR site,
// which is why un-prefixed links opened broken portal pages.
export function normalizeUrl(raw: unknown): string | null {
  let s = String(raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('//')) s = 'https:' + s
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString().slice(0, 500)
  } catch {
    return null
  }
}

// For rendering: always produce an absolute link (or '#').
export function safeHref(raw: string | null | undefined): string {
  return normalizeUrl(raw) || '#'
}
