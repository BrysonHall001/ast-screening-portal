import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { PortalShell } from '@/components/PortalShell'
import { NewOrderForm } from './NewOrderForm'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function NewOrderPage() {
  const user = await getCurrentUser().catch(() => null)
  if (!user) redirect('/login')
  const clients = (await sql`SELECT * FROM clients ORDER BY name`) as Client[]
  return (
    <PortalShell userName={user.full_name} userRole={user.role}>
      <NewOrderForm clients={JSON.parse(JSON.stringify(clients))} />
    </PortalShell>
  )
}
