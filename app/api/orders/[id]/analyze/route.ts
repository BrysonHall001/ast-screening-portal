import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { analyzeItem } from '@/lib/analyze'
import { normalizeCategories } from '@/lib/categories'

export const maxDuration = 300

// Runs AI analysis over this order's captured content. By default only
// items without an analysis yet; pass { rerun: true } to redo everything
// (e.g. after changing client keywords).
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
  const body = await req.json().catch(() => ({}))
  const rerun = body.rerun === true

  const orders = (await sql`
    SELECT o.*, c.keywords AS client_keywords FROM orders o
    JOIN clients c ON c.id = o.client_id WHERE o.id = ${id}
  `) as any[]
  const order = orders[0]
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (['draft', 'consent_sent', 'cancelled'].includes(order.status)) {
    return NextResponse.json(
      { error: 'Analysis requires completed consent' },
      { status: 400 }
    )
  }

  const cats = normalizeCategories(order.categories)
  const enabledKeys = Object.keys(cats).filter((k) => cats[k])

  const items = (await sql`
    SELECT ci.id, ci.platform, ci.posted_at, ci.content_text, ci.image, ci.image_mime,
           (a.id IS NOT NULL) AS analyzed
    FROM content_items ci
    LEFT JOIN analyses a ON a.content_item_id = ci.id
    WHERE ci.order_id = ${id}
    ORDER BY ci.created_at
  `) as any[]

  const todo = items.filter((i) => rerun || !i.analyzed)
  if (todo.length === 0) {
    return NextResponse.json({ analyzed: 0, failed: 0, message: 'Nothing new to analyze' })
  }

  if (['consent_completed', 'collecting'].includes(order.status)) {
    await sql`UPDATE orders SET status = 'analysis', updated_at = NOW() WHERE id = ${id}`
  }
  await audit(user.email, 'analysis.started', id, {
    items: todo.length, rerun, categories: enabledKeys,
  })

  let ok = 0
  let failed = 0
  for (const item of todo) {
    try {
      const result = await analyzeItem(
        {
          platform: item.platform,
          postedAt: item.posted_at,
          contentText: item.content_text,
          imageBase64: item.image ? Buffer.from(item.image).toString('base64') : null,
          imageMime: item.image_mime,
        },
        enabledKeys,
        order.client_keywords || ''
      )
      await sql`
        INSERT INTO analyses (content_item_id, flags, suppressed, suppression_reason, model, error, analyzed_at)
        VALUES (${item.id}, ${JSON.stringify(result.flags)}, ${result.suppressed},
                ${result.suppression_reason}, ${result.model}, ${null}, NOW())
        ON CONFLICT (content_item_id) DO UPDATE SET
          flags = EXCLUDED.flags, suppressed = EXCLUDED.suppressed,
          suppression_reason = EXCLUDED.suppression_reason,
          model = EXCLUDED.model, error = NULL, analyzed_at = NOW()
      `
      ok++
    } catch (err: any) {
      failed++
      const msg = String(err?.message || err).slice(0, 500)
      await sql`
        INSERT INTO analyses (content_item_id, flags, suppressed, suppression_reason, model, error, analyzed_at)
        VALUES (${item.id}, '[]', FALSE, ${null}, ${null}, ${msg}, NOW())
        ON CONFLICT (content_item_id) DO UPDATE SET error = EXCLUDED.error, analyzed_at = NOW()
      `
    }
  }

  // Analysis complete → ready for human review.
  if (failed === 0) {
    await sql`UPDATE orders SET status = 'in_review', updated_at = NOW() WHERE id = ${id}`
  }
  await audit(user.email, 'analysis.finished', id, { analyzed: ok, failed })
  return NextResponse.json({ analyzed: ok, failed })
}
