import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function DELETE(
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
  const rows = (await sql`
    DELETE FROM content_items WHERE id = ${id} RETURNING order_id
  `) as any[]
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await audit(user.email, 'content.deleted', rows[0].order_id, { item_id: id })
  return NextResponse.json({ ok: true })
}
