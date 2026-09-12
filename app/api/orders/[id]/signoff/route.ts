import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'

// Final human sign-off: every analyzed, non-suppressed item must have a
// review decision. Flips the screening to report_ready.
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
  const orders = (await sql`SELECT status FROM orders WHERE id = ${id}`) as any[]
  if (!orders[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (orders[0].status !== 'in_review') {
    return NextResponse.json(
      { error: 'Screening must be in review to sign off' },
      { status: 400 }
    )
  }

  const pending = (await sql`
    SELECT COUNT(*)::int AS n
    FROM content_items ci JOIN analyses a ON a.content_item_id = ci.id
    WHERE ci.order_id = ${id} AND a.suppressed = FALSE AND a.final_flags IS NULL
  `) as { n: number }[]
  if (pending[0].n > 0) {
    return NextResponse.json(
      { error: `${pending[0].n} item(s) still need review` },
      { status: 400 }
    )
  }
  const unanalyzed = (await sql`
    SELECT COUNT(*)::int AS n
    FROM content_items ci LEFT JOIN analyses a ON a.content_item_id = ci.id
    WHERE ci.order_id = ${id} AND a.id IS NULL
  `) as { n: number }[]
  if (unanalyzed[0].n > 0) {
    return NextResponse.json(
      { error: `${unanalyzed[0].n} captured item(s) were never analyzed — run analysis first` },
      { status: 400 }
    )
  }

  await sql`
    UPDATE orders SET status = 'report_ready', signed_off_by = ${user.id},
      signed_off_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
  `
  await audit(user.email, 'review.signed_off', id)
  return NextResponse.json({ ok: true })
}
