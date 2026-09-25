import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { draftSummary } from '@/lib/summary'

export const maxDuration = 120

// Returns an AI DRAFT of the flagged-post summary. Nothing is saved here:
// the analyst edits it and saves it explicitly (PATCH save_summary).
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
    const draft = await draftSummary(id)
    await audit(user.email, 'report.summary_drafted', id)
    return NextResponse.json({ draft })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 400 })
  }
}
