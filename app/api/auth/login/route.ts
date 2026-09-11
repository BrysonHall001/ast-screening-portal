import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql } from '@/lib/db'
import { setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }
  const rows = (await sql`
    SELECT id, password_hash FROM users WHERE LOWER(email) = LOWER(${email})
  `) as { id: number; password_hash: string | null }[]
  const user = rows[0]
  if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }
  setSessionCookie(user.id)
  return NextResponse.json({ ok: true })
}
