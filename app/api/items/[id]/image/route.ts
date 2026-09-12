import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = Number(params.id)
  const rows = (await sql`
    SELECT image, image_mime FROM content_items WHERE id = ${id}
  `) as { image: Buffer | null; image_mime: string | null }[]
  const row = rows[0]
  if (!row?.image) return NextResponse.json({ error: 'No image' }, { status: 404 })
  return new NextResponse(new Uint8Array(row.image), {
    headers: {
      'Content-Type': row.image_mime || 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
