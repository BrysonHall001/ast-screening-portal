import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { normalizeCategories } from '@/lib/categories'

export async function PATCH(
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
  if (body.name !== undefined) {
    await sql`UPDATE clients SET name = ${body.name} WHERE id = ${id}`
  }
  if (body.contact_name !== undefined) {
    await sql`UPDATE clients SET contact_name = ${body.contact_name || null} WHERE id = ${id}`
  }
  if (body.contact_email !== undefined) {
    await sql`UPDATE clients SET contact_email = ${body.contact_email || null} WHERE id = ${id}`
  }
  if (body.categories !== undefined) {
    const cats = JSON.stringify(normalizeCategories(body.categories))
    await sql`UPDATE clients SET categories = ${cats} WHERE id = ${id}`
    await audit(user.email, 'client.categories_changed', null, { client_id: id, categories: JSON.parse(cats) })
  }
  if (body.keywords !== undefined) {
    await sql`UPDATE clients SET keywords = ${String(body.keywords)} WHERE id = ${id}`
  }
  const rows = (await sql`SELECT * FROM clients WHERE id = ${id}`) as any[]
  return NextResponse.json({ client: rows[0] })
}
