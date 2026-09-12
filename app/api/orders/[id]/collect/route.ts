import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { collectForOrder } from '@/lib/collect'
import { runAnalysis } from '@/lib/runAnalysis'

export const maxDuration = 300

// Manually (re)run the automated collector, then analysis, for one order.
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
  try {
    const results = await collectForOrder(id, user.email)
    const collected = results.reduce((a, r) => a + r.items, 0)
    let analysis = null
    if (collected > 0) {
      analysis = await runAnalysis(id, 'system:auto').catch((e) => ({
        analyzed: 0, failed: 0, message: String(e?.message || e),
      }))
    }
    return NextResponse.json({ results, collected, analysis })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 400 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const runs = await sql`
    SELECT * FROM collection_runs WHERE order_id = ${Number(params.id)}
    ORDER BY started_at DESC LIMIT 5
  `
  return NextResponse.json({ runs })
}
