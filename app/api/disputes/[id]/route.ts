import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { disputeResolvedEmail, sendMail } from '@/lib/email'

export async function PATCH(
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
  if (body.action !== 'resolve') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  const resolution = String(body.resolution || '').trim()
  if (!resolution) {
    return NextResponse.json({ error: 'A resolution summary is required' }, { status: 400 })
  }
  const rows = (await sql`
    UPDATE disputes SET status = 'resolved', resolution = ${resolution.slice(0, 5000)},
      resolved_at = NOW()
    WHERE id = ${id} AND status = 'open'
    RETURNING order_id
  `) as any[]
  if (!rows[0]) {
    return NextResponse.json({ error: 'Dispute not found or already resolved' }, { status: 404 })
  }
  const orders = (await sql`
    SELECT candidate_name, candidate_email FROM orders WHERE id = ${rows[0].order_id}
  `) as any[]
  await audit(user.email, 'dispute.resolved', rows[0].order_id, { dispute_id: id })
  await sendMail({
    to: orders[0].candidate_email,
    ...disputeResolvedEmail({
      candidateName: orders[0].candidate_name,
      resolution,
    }),
  })
  return NextResponse.json({ ok: true })
}
