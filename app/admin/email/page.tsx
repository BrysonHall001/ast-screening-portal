import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { PortalShell } from '@/components/PortalShell'
import { mailFrom, mailMethod } from '@/lib/email'
import { EmailAdmin } from './EmailAdmin'

export const dynamic = 'force-dynamic'

export default async function EmailPage() {
  const user = await getCurrentUser().catch(() => null)
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/admin')
  const log = (await sql`
    SELECT id, to_address, subject, method, status, error, created_at
    FROM email_log ORDER BY created_at DESC LIMIT 30
  `) as any[]
  return (
    <PortalShell userName={user.full_name} userRole={user.role}>
      <EmailAdmin
        method={mailMethod()}
        from={mailFrom()}
        selfEmail={user.email}
        log={JSON.parse(JSON.stringify(log))}
      />
    </PortalShell>
  )
}
