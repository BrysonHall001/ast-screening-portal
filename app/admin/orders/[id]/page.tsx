import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { PortalShell } from '@/components/PortalShell'
import { OrderDetail } from './OrderDetail'

export const dynamic = 'force-dynamic'

export default async function OrderPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser().catch(() => null)
  if (!user) redirect('/login')
  const id = Number(params.id)
  if (!Number.isFinite(id)) notFound()

  const orders = (await sql`
    SELECT o.*, c.name AS client_name, c.contact_email, u.full_name AS created_by_name,
           su.full_name AS signed_off_by_name
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    LEFT JOIN users u ON u.id = o.created_by
    LEFT JOIN users su ON su.id = o.signed_off_by
    WHERE o.id = ${id}
  `) as any[]
  if (!orders[0]) notFound()

  const consents = (await sql`SELECT * FROM consents WHERE order_id = ${id}`) as any[]
  const profiles = (await sql`
    SELECT * FROM candidate_profiles WHERE order_id = ${id} ORDER BY created_at
  `) as any[]
  const auditRows = (await sql`
    SELECT * FROM audit_log WHERE order_id = ${id} ORDER BY created_at DESC LIMIT 100
  `) as any[]
  const itemCount = ((await sql`
    SELECT COUNT(*)::int AS n FROM content_items WHERE order_id = ${id}
  `) as any[])[0].n
  const reports = (await sql`
    SELECT r.id, r.version, r.generated_at, r.delivered_to, r.delivered_at,
           u.full_name AS generated_by_name
    FROM reports r LEFT JOIN users u ON u.id = r.generated_by
    WHERE r.order_id = ${id} ORDER BY r.version DESC
  `) as any[]
  const adverse = ((await sql`
    SELECT * FROM adverse_actions WHERE order_id = ${id}
  `) as any[])[0] ?? null
  const disputes = (await sql`
    SELECT * FROM disputes WHERE order_id = ${id} ORDER BY opened_at DESC
  `) as any[]

  return (
    <PortalShell userName={user.full_name} userRole={user.role}>
      <OrderDetail
        initial={JSON.parse(
          JSON.stringify({
            order: orders[0],
            consent: consents[0] ?? null,
            profiles,
            audit: auditRows,
            itemCount,
            reports,
            adverse,
            disputes,
            isAdmin: user.role === 'admin',
          })
        )}
      />
    </PortalShell>
  )
}
