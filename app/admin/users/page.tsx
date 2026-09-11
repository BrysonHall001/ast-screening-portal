import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { PortalShell } from '@/components/PortalShell'
import { UsersAdmin } from './UsersAdmin'
import type { User } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const user = await getCurrentUser().catch(() => null)
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/admin')
  const users = (await sql`
    SELECT id, email, full_name, role, created_at FROM users ORDER BY full_name
  `) as User[]
  return (
    <PortalShell userName={user.full_name} userRole={user.role}>
      <UsersAdmin initialUsers={JSON.parse(JSON.stringify(users))} selfId={user.id} />
    </PortalShell>
  )
}
