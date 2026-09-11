import { cookies } from 'next/headers'
import crypto from 'crypto'
import { sql } from './db'
import type { User } from './types'

const COOKIE_NAME = 'asp_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14 // 14 days

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) {
    throw new Error(
      'SESSION_SECRET is missing or too short. Set a long random string in your env.'
    )
  }
  return s
}

// Tiny HMAC-signed token: base64url(payload).base64url(hmac).
// Not a JWT (no dep needed) but functionally equivalent for our purposes.
function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(body)
    .digest('base64url')
  return `${body}.${sig}`
}

function verify(token: string): { user_id: number; exp: number } | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(body)
    .digest('base64url')
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof parsed.user_id !== 'number' || typeof parsed.exp !== 'number') {
      return null
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null
    return parsed
  } catch {
    return null
  }
}

export function setSessionCookie(userId: number) {
  const token = sign({
    user_id: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, '', { path: '/', maxAge: 0 })
}

export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = verify(token)
  if (!payload) return null
  const rows = (await sql`
    SELECT id, email, full_name, role, created_at
    FROM users WHERE id = ${payload.user_id}
  `) as User[]
  return rows[0] ?? null
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser()
  if (user.role !== 'admin') throw new Error('FORBIDDEN')
  return user
}
