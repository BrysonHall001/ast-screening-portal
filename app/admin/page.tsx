import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { PortalShell } from '@/components/PortalShell'
import { OrdersDashboard } from './OrdersDashboard'
import type { Order } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getCurrentUser().catch(() => null)
  if (!user) redirect('/login')

  const orders = (await sql`
    SELECT o.*, c.name AS client_name, u.full_name AS created_by_name,
      (SELECT COUNT(*)::int FROM candidate_profiles p WHERE p.order_id = o.id) AS profile_count
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    LEFT JOIN users u ON u.id = o.created_by
    ORDER BY o.created_at DESC
  `) as (Order & { profile_count: number })[]

  return (
    <PortalShell userName={user.full_name} userRole={user.role}>
      <OrdersDashboard initialOrders={JSON.parse(JSON.stringify(orders))} />
    </PortalShell>
  )
}
