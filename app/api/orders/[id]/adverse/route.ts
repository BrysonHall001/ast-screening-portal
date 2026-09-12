import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { appUrl, sendMail } from '@/lib/email'
import { PRE_ADVERSE_EMAIL_TEXT, ADVERSE_EMAIL_TEXT } from '@/lib/legal'

// The FCRA two-step. Pre-adverse: candidate gets the report + rights BEFORE
// any final decision. Final adverse: only after pre-adverse, with the
// waiting period tracked (the UI warns when it's under 5 business days).
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
  const step = body.step

  const orders = (await sql`SELECT * FROM orders WHERE id = ${id}`) as any[]
  const order = orders[0]
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (order.status !== 'delivered') {
    return NextResponse.json(
      { error: 'Adverse action applies only after a report is delivered' },
      { status: 400 }
    )
  }
  const reports = (await sql`
    SELECT candidate_token FROM reports WHERE order_id = ${id} ORDER BY version DESC LIMIT 1
  `) as any[]
  if (!reports[0]) return NextResponse.json({ error: 'No report' }, { status: 400 })
  const candidateLink = `${appUrl()}/api/report/${reports[0].candidate_token}`

  const existing = (await sql`
    SELECT * FROM adverse_actions WHERE order_id = ${id}
  `) as any[]

  if (step === 'pre') {
    if (existing[0]?.pre_adverse_sent_at) {
      return NextResponse.json({ error: 'Pre-adverse notice already sent' }, { status: 400 })
    }
    await sendMail({
      to: order.candidate_email,
      subject: 'Important: notice regarding your employment screening',
      text: PRE_ADVERSE_EMAIL_TEXT(order.candidate_name, candidateLink),
    })
    await sql`
      INSERT INTO adverse_actions (order_id, pre_adverse_sent_at, pre_adverse_sent_by, note)
      VALUES (${id}, NOW(), ${user.id}, ${body.note || null})
      ON CONFLICT (order_id) DO UPDATE SET
        pre_adverse_sent_at = NOW(), pre_adverse_sent_by = ${user.id},
        note = COALESCE(EXCLUDED.note, adverse_actions.note)
    `
    await audit(user.email, 'adverse.pre_notice_sent', id)
    return NextResponse.json({ ok: true })
  }

  if (step === 'final') {
    if (!existing[0]?.pre_adverse_sent_at) {
      return NextResponse.json(
        { error: 'The pre-adverse notice must be sent first' },
        { status: 400 }
      )
    }
    if (existing[0]?.adverse_sent_at) {
      return NextResponse.json({ error: 'Adverse action notice already sent' }, { status: 400 })
    }
    const openDisputes = (await sql`
      SELECT COUNT(*)::int AS n FROM disputes WHERE order_id = ${id} AND status = 'open'
    `) as any[]
    if (openDisputes[0].n > 0 && body.override_dispute !== true) {
      return NextResponse.json(
        { error: 'An open dispute exists on this screening. Resolve it first (or explicitly override).', dispute_block: true },
        { status: 409 }
      )
    }
    await sendMail({
      to: order.candidate_email,
      subject: 'Adverse action notice',
      text: ADVERSE_EMAIL_TEXT(order.candidate_name, candidateLink),
    })
    await sql`
      UPDATE adverse_actions SET adverse_sent_at = NOW(), adverse_sent_by = ${user.id}
      WHERE order_id = ${id}
    `
    await audit(user.email, 'adverse.final_notice_sent', id, {
      dispute_override: body.override_dispute === true,
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown step' }, { status: 400 })
}
