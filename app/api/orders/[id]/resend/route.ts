import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { appUrl, consentInviteEmail, sendMail } from '@/lib/email'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  let user
  try {
    user = await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = Number(params.id)
  const rows = (await sql`
    SELECT o.candidate_name, o.candidate_email, o.consent_token, o.status, c.name AS client_name
    FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ${id}
  `) as any[]
  const order = rows[0]
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (['consent_completed', 'cancelled'].includes(order.status)) {
    return NextResponse.json({ error: 'Consent already completed or order cancelled' }, { status: 400 })
  }
  const link = `${appUrl()}/consent/${order.consent_token}`
  const mail = consentInviteEmail({
    candidateName: order.candidate_name,
    clientName: order.client_name,
    link,
  })
  const sent = await sendMail({ to: order.candidate_email, ...mail })
  if (sent.method === 'log') {
    await audit(user.email, 'consent.invite_not_sent', id, { reason: 'email not configured' })
    return NextResponse.json(
      { error: 'Email is not set up yet, so nothing was sent. Use "Copy consent link" to send it yourself for now.' },
      { status: 400 }
    )
  }
  if (!sent.ok) {
    await audit(user.email, 'consent.invite_failed', id, { error: sent.error })
    return NextResponse.json(
      { error: `The email did not send: ${sent.error}` },
      { status: 502 }
    )
  }
  await sql`
    UPDATE orders SET status = 'consent_sent',
      consent_sent_at = COALESCE(consent_sent_at, NOW()), updated_at = NOW()
    WHERE id = ${id}
  `
  await audit(user.email, 'consent.invite_resent', id)
  return NextResponse.json({ ok: true })
}
