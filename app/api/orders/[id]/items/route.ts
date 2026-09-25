import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { normalizeUrl } from '@/lib/urls'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

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
  const items = await sql`
    SELECT ci.id, ci.order_id, ci.source, ci.platform, ci.url, ci.posted_at,
           ci.content_text, (ci.image IS NOT NULL) AS has_image, ci.image_mime,
           ci.captured_by, u.full_name AS captured_by_name, ci.created_at,
           a.flags, a.suppressed, a.suppression_reason, a.model,
           a.error AS analysis_error, a.analyzed_at,
           a.final_flags, a.reviewed_at, a.reviewer_note, a.redact_image,
           ru.full_name AS reviewed_by_name
    FROM content_items ci
    LEFT JOIN users u ON u.id = ci.captured_by
    LEFT JOIN analyses a ON a.content_item_id = ci.id
    LEFT JOIN users ru ON ru.id = a.reviewed_by
    WHERE ci.order_id = ${id}
    ORDER BY ci.created_at DESC
  `
  return NextResponse.json({ items })
}

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
  const id = Number(params.id)
  const orders = (await sql`SELECT id, status FROM orders WHERE id = ${id}`) as any[]
  const order = orders[0]
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'This screening is cancelled' }, { status: 400 })
  }
  if (!order || ['draft', 'consent_sent'].includes(order.status)) {
    return NextResponse.json(
      { error: 'Content cannot be captured before the candidate completes consent' },
      { status: 400 }
    )
  }

  const form = await req.formData()
  const platform = String(form.get('platform') || '').slice(0, 40)
  const url = normalizeUrl(form.get('url'))
  const postedAt = String(form.get('posted_at') || '').trim() || null
  const contentText = String(form.get('content_text') || '').trim().slice(0, 10000) || null
  const file = form.get('image') as File | null

  let imageBuf: Buffer | null = null
  let imageMime: string | null = null
  if (file && typeof file !== 'string' && file.size > 0) {
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: 'Image must be PNG, JPEG, WebP, or GIF' },
        { status: 400 }
      )
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 })
    }
    imageBuf = Buffer.from(await file.arrayBuffer())
    imageMime = file.type
  }

  if (!platform) {
    return NextResponse.json({ error: 'Platform is required' }, { status: 400 })
  }
  if (!contentText && !imageBuf) {
    return NextResponse.json(
      { error: 'Provide the post text, a screenshot, or both' },
      { status: 400 }
    )
  }

  const rows = (await sql`
    INSERT INTO content_items
      (order_id, platform, url, posted_at, content_text, image, image_mime, captured_by)
    VALUES
      (${id}, ${platform}, ${url}, ${postedAt}, ${contentText}, ${imageBuf}, ${imageMime}, ${user.id})
    RETURNING id
  `) as { id: number }[]

  // First captured item moves the screening into 'collecting'.
  if (order.status === 'consent_completed') {
    await sql`UPDATE orders SET status = 'collecting', updated_at = NOW() WHERE id = ${id}`
    await audit(user.email, 'order.collection_started', id)
  }
  await audit(user.email, 'content.captured', id, {
    item_id: rows[0].id, platform, has_image: !!imageBuf,
  })
  return NextResponse.json({ id: rows[0].id })
}
