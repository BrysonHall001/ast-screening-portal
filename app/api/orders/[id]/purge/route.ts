import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { audit } from '@/lib/audit'

// Retention: admin-only purge of a closed screening's content. Deletes the
// captured posts/images, analyses, and report PDFs. KEEPS the consent
// record and the audit trail (those prove the screening was done lawfully).
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }
  const id = Number(params.id)
  const orders = (await sql`SELECT status, purged_at FROM orders WHERE id = ${id}`) as any[]
  const order = orders[0]
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (order.purged_at) {
    return NextResponse.json({ error: 'Already purged' }, { status: 400 })
  }
  if (!['delivered', 'cancelled'].includes(order.status)) {
    return NextResponse.json(
      { error: 'Only delivered or cancelled screenings can be purged' },
      { status: 400 }
    )
  }
  const items = (await sql`
    DELETE FROM content_items WHERE order_id = ${id} RETURNING id
  `) as any[]
  const reports = (await sql`
    DELETE FROM reports WHERE order_id = ${id} RETURNING id
  `) as any[]
  await sql`DELETE FROM candidate_profiles WHERE order_id = ${id}`
  await sql`UPDATE orders SET purged_at = NOW(), updated_at = NOW() WHERE id = ${id}`
  await audit(admin.email, 'order.purged', id, {
    items_deleted: items.length, reports_deleted: reports.length,
  })
  return NextResponse.json({ ok: true, items_deleted: items.length, reports_deleted: reports.length })
}
