import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const id = Number(params.id)
  const body = await req.json().catch(() => ({}))
  if (body.password) {
    if (String(body.password).length < 8) {
      return NextResponse.json({ error: 'Password must be 8+ characters' }, { status: 400 })
    }
    const hash = await bcrypt.hash(body.password, 10)
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`
    await audit(admin.email, 'user.password_reset', null, { user_id: id })
  }
  if (body.role && ['admin', 'analyst'].includes(body.role)) {
    await sql`UPDATE users SET role = ${body.role} WHERE id = ${id}`
    await audit(admin.email, 'user.role_changed', null, { user_id: id, role: body.role })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const id = Number(params.id)
  if (id === admin.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }
  await sql`DELETE FROM users WHERE id = ${id}`
  await audit(admin.email, 'user.deleted', null, { user_id: id })
  return NextResponse.json({ ok: true })
}
