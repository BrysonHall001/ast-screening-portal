import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { disputeAckEmail, sendMail } from '@/lib/email'

// Log a candidate dispute (they arrive by email/phone; staff record them
// here). Starts the 30-day reinvestigation clock and acks the candidate.
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
  const description = String(body.description || '').trim()
  if (!description) {
    return NextResponse.json({ error: 'Describe what is disputed' }, { status: 400 })
  }
  const orders = (await sql`
    SELECT candidate_name, candidate_email FROM orders WHERE id = ${id}
  `) as any[]
  if (!orders[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = (await sql`
    INSERT INTO disputes (order_id, description, opened_by)
    VALUES (${id}, ${description.slice(0, 5000)}, ${user.id})
    RETURNING *
  `) as any[]
  await audit(user.email, 'dispute.opened', id, { dispute_id: rows[0].id })
  await sendMail({
    to: orders[0].candidate_email,
    ...disputeAckEmail({ candidateName: orders[0].candidate_name }),
  })
  return NextResponse.json({ dispute: rows[0] })
}
