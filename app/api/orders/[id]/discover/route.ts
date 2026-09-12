import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { discoverForOrder } from '@/lib/discover'

export const maxDuration = 300

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
  try {
    const suggestions = await discoverForOrder(Number(params.id), user.email)
    return NextResponse.json({ suggestions })
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
  const suggestions = await sql`
    SELECT * FROM discovered_profiles WHERE order_id = ${Number(params.id)}
    ORDER BY (status = 'suggested') DESC, score DESC, id
  `
  return NextResponse.json({ suggestions })
}
