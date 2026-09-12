import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { PortalShell } from '@/components/PortalShell'
import { ReviewQueue } from './ReviewQueue'

export const dynamic = 'force-dynamic'

export default async function ReviewPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser().catch(() => null)
  if (!user) redirect('/login')
  const id = Number(params.id)
  if (!Number.isFinite(id)) notFound()
  const orders = (await sql`
    SELECT o.*, c.name AS client_name FROM orders o
    JOIN clients c ON c.id = o.client_id WHERE o.id = ${id}
  `) as any[]
  if (!orders[0]) notFound()
  return (
    <PortalShell userName={user.full_name} userRole={user.role}>
      <ReviewQueue order={JSON.parse(JSON.stringify(orders[0]))} />
    </PortalShell>
  )
}
