import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = Number(params.id)
  const orders = (await sql`
    SELECT o.*, c.name AS client_name, u.full_name AS created_by_name
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    LEFT JOIN users u ON u.id = o.created_by
    WHERE o.id = ${id}
  `) as any[]
  if (!orders[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const consents = await sql`SELECT * FROM consents WHERE order_id = ${id}`
  const profiles = await sql`
    SELECT * FROM candidate_profiles WHERE order_id = ${id} ORDER BY created_at
  `
  const auditRows = await sql`
    SELECT * FROM audit_log WHERE order_id = ${id} ORDER BY created_at DESC LIMIT 100
  `
  return NextResponse.json({
    order: orders[0],
    consent: (consents as any[])[0] ?? null,
    profiles,
    audit: auditRows,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let user
  try {
    user = await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = Number(params.id)
  const body = await req.json().catch(() => ({}))
  if (body.action === 'cancel') {
    await sql`
      UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = ${id}
    `
    await audit(user.email, 'order.cancelled', id)
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'add_profile') {
    const { platform, url } = body
    if (!platform || !url) {
      return NextResponse.json({ error: 'Platform and URL required' }, { status: 400 })
    }
    await sql`
      INSERT INTO candidate_profiles (order_id, platform, url, added_by)
      VALUES (${id}, ${platform}, ${url}, 'analyst')
    `
    await audit(user.email, 'profile.added_by_analyst', id, { platform, url })
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'remove_profile') {
    await sql`
      DELETE FROM candidate_profiles WHERE id = ${Number(body.profile_id)} AND order_id = ${id}
    `
    await audit(user.email, 'profile.removed', id, { profile_id: body.profile_id })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
