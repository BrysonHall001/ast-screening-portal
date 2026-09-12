import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { runAnalysis } from '@/lib/runAnalysis'

export const maxDuration = 300

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
  const body = await req.json().catch(() => ({}))
  try {
    const result = await runAnalysis(Number(params.id), user.email, body.rerun === true)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 400 })
  }
}
