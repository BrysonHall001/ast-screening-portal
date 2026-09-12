import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'

// Staff preview of a stored report PDF.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rows = (await sql`
    SELECT pdf, order_id, version FROM reports WHERE id = ${Number(params.id)}
  `) as any[]
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(new Uint8Array(rows[0].pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="screening-ASP-${String(rows[0].order_id).padStart(5, '0')}-v${rows[0].version}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
