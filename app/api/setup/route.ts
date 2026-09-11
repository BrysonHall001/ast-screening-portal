import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql } from '@/lib/db'
import { setSessionCookie } from '@/lib/auth'
import { audit } from '@/lib/audit'

// Creates the very first admin. Refuses if any user already exists.
export async function POST(req: NextRequest) {
  const existing = (await sql`SELECT COUNT(*)::int AS n FROM users`) as { n: number }[]
  if (existing[0].n > 0) {
    return NextResponse.json({ error: 'Setup already completed' }, { status: 403 })
  }
  const { full_name, email, password } = await req.json().catch(() => ({}))
  if (!full_name || !email || !password || String(password).length < 8) {
    return NextResponse.json(
      { error: 'Name, email, and a password of 8+ characters are required' },
      { status: 400 }
    )
  }
  const hash = await bcrypt.hash(password, 10)
  const rows = (await sql`
    INSERT INTO users (email, password_hash, full_name, role)
    VALUES (${email}, ${hash}, ${full_name}, 'admin')
    RETURNING id
  `) as { id: number }[]
  setSessionCookie(rows[0].id)
  await audit(email, 'setup.first_admin_created', null)
  return NextResponse.json({ ok: true })
}
