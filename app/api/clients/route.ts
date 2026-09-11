import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { defaultCategories } from '@/lib/categories'

export async function GET() {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const clients = await sql`
    SELECT c.*, (SELECT COUNT(*)::int FROM orders o WHERE o.client_id = c.id) AS order_count
    FROM clients c ORDER BY c.name
  `
  return NextResponse.json({ clients })
}

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { name, contact_name, contact_email } = await req.json().catch(() => ({}))
  if (!name) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
  }
  const cats = JSON.stringify(defaultCategories())
  const rows = (await sql`
    INSERT INTO clients (name, contact_name, contact_email, categories)
    VALUES (${name}, ${contact_name || null}, ${contact_email || null}, ${cats})
    RETURNING *
  `) as any[]
  await audit(user.email, 'client.created', null, { client_id: rows[0].id, name })
  return NextResponse.json({ client: rows[0] })
}
