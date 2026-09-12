import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'

// The human decision on a discovered profile. Confirm attaches it as an
// analyst-verified candidate_profile (collectable); reject buries it.
// Both are audited — this decision IS the FCRA accuracy procedure.
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
  const action = body.action
  if (!['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  const rows = (await sql`
    SELECT * FROM discovered_profiles WHERE id = ${id} AND status = 'suggested'
  `) as any[]
  const s = rows[0]
  if (!s) {
    return NextResponse.json({ error: 'Suggestion not found or already decided' }, { status: 404 })
  }
  await sql`
    UPDATE discovered_profiles SET status = ${action === 'confirm' ? 'confirmed' : 'rejected'},
      decided_by = ${user.id}, decided_at = NOW()
    WHERE id = ${id}
  `
  if (action === 'confirm') {
    await sql`
      INSERT INTO candidate_profiles (order_id, platform, url, added_by)
      VALUES (${s.order_id}, ${s.platform}, ${s.url}, 'analyst')
    `
    await audit(user.email, 'discovery.profile_confirmed', s.order_id, {
      url: s.url, score: s.score,
    })
  } else {
    await audit(user.email, 'discovery.profile_rejected', s.order_id, { url: s.url })
  }
  return NextResponse.json({ ok: true })
}
