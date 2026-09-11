import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { PortalShell } from '@/components/PortalShell'
import { ClientsAdmin } from './ClientsAdmin'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const user = await getCurrentUser().catch(() => null)
  if (!user) redirect('/login')
  const clients = (await sql`
    SELECT c.*, (SELECT COUNT(*)::int FROM orders o WHERE o.client_id = c.id) AS order_count
    FROM clients c ORDER BY c.name
  `) as (Client & { order_count: number })[]
  return (
    <PortalShell userName={user.full_name} userRole={user.role}>
      <ClientsAdmin initialClients={JSON.parse(JSON.stringify(clients))} />
    </PortalShell>
  )
}
