import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const users = await sql`
    SELECT id, email, full_name, role, created_at FROM users ORDER BY full_name
  `
  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { email, full_name, role, password } = await req.json().catch(() => ({}))
  if (!email || !full_name || !['admin', 'analyst'].includes(role) || !password || String(password).length < 8) {
    return NextResponse.json(
      { error: 'Email, name, role, and a password of 8+ characters are required' },
      { status: 400 }
    )
  }
  const hash = await bcrypt.hash(password, 10)
  try {
    const rows = (await sql`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES (${email}, ${hash}, ${full_name}, ${role})
      RETURNING id, email, full_name, role, created_at
    `) as any[]
    await audit(admin.email, 'user.created', null, { email, role })
    return NextResponse.json({ user: rows[0] })
  } catch {
    return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
  }
}
