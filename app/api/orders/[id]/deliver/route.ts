import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { appUrl, reportDeliveryEmail, sendMail, consentCopyEmail } from '@/lib/email'

// Email the latest report link to the client contact. Marks delivered.
// If the candidate requested a copy at consent time, they get theirs too.
export async function POST(
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

  const orders = (await sql`
    SELECT o.*, c.name AS client_name, c.contact_email
    FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ${id}
  `) as any[]
  const order = orders[0]
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const reports = (await sql`
    SELECT * FROM reports WHERE order_id = ${id} ORDER BY version DESC LIMIT 1
  `) as any[]
  const report = reports[0]
  if (!report) {
    return NextResponse.json({ error: 'Generate the report first' }, { status: 400 })
  }

  const to = String(body.email || order.contact_email || '').trim()
  if (!to) {
    return NextResponse.json(
      { error: 'No delivery email — set the client contact email or provide one' },
      { status: 400 }
    )
  }

  const link = `${appUrl()}/api/report/${report.share_token}`
  const mail = reportDeliveryEmail({
    clientName: order.client_name,
    candidateName: order.candidate_name,
    link,
  })
  const sent = await sendMail({ to, ...mail })
  if (!sent.ok) {
    await audit(user.email, 'report.delivery_failed', id, { to, error: sent.error })
    return NextResponse.json(
      { error: `The report email did not send, so the screening was NOT marked delivered. ${sent.error}` },
      { status: 502 }
    )
  }

  await sql`
    UPDATE reports SET delivered_to = ${to}, delivered_at = NOW() WHERE id = ${report.id}
  `
  await sql`
    UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = ${id}
  `
  await audit(user.email, 'report.delivered', id, { report_id: report.id, to })

  // Candidate copy, if they asked for one at consent time.
  const consents = (await sql`
    SELECT wants_copy FROM consents WHERE order_id = ${id}
  `) as any[]
  if (consents[0]?.wants_copy) {
    await sendMail({
      to: order.candidate_email,
      subject: 'Your screening report copy',
      text: `Hi ${order.candidate_name},

At the time you authorized your screening, you requested a copy of any report prepared about you. It is available here:

${appUrl()}/api/report/${report.candidate_token}

You have the right to dispute anything inaccurate or incomplete by replying to this email.

All-Star Talent`,
    })
    await audit('system', 'report.candidate_copy_sent', id, { report_id: report.id })
  }
  return NextResponse.json({ ok: true })
}
