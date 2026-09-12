import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { audit } from '@/lib/audit'

// Public (token-credential) report access for the client contact and the
// candidate. Any valid token — even from an older version — serves the
// LATEST report for that screening, so links sent before a dispute
// correction automatically show the corrected report. Which audience's
// token matched is audited.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const match = (await sql`
    SELECT order_id, (share_token = ${params.token}) AS is_client
    FROM reports
    WHERE share_token = ${params.token} OR candidate_token = ${params.token}
    LIMIT 1
  `) as any[]
  if (!match[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const latest = (await sql`
    SELECT id, order_id, version, pdf FROM reports
    WHERE order_id = ${match[0].order_id}
    ORDER BY version DESC LIMIT 1
  `) as any[]
  const r = latest[0]
  await audit(match[0].is_client ? 'client' : 'candidate', 'report.viewed', r.order_id, {
    report_id: r.id, version: r.version,
  })
  return new NextResponse(new Uint8Array(r.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="screening-report.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
