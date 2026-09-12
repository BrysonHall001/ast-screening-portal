import { sql } from './db'
import { audit } from './audit'
import { analyzeItem } from './analyze'
import { normalizeCategories } from './categories'

// Shared analysis runner used by the analyze API route and the automated
// collection pipeline.
export async function runAnalysis(
  orderId: number,
  actor: string,
  rerun = false
): Promise<{ analyzed: number; failed: number; message?: string }> {
  const orders = (await sql`
    SELECT o.*, c.keywords AS client_keywords FROM orders o
    JOIN clients c ON c.id = o.client_id WHERE o.id = ${orderId}
  `) as any[]
  const order = orders[0]
  if (!order) throw new Error('Order not found')
  if (['draft', 'consent_sent', 'cancelled'].includes(order.status)) {
    throw new Error('Analysis requires completed consent')
  }

  const cats = normalizeCategories(order.categories)
  const enabledKeys = Object.keys(cats).filter((k) => cats[k])

  const items = (await sql`
    SELECT ci.id, ci.platform, ci.posted_at, ci.content_text, ci.image, ci.image_mime,
           (a.id IS NOT NULL) AS analyzed
    FROM content_items ci
    LEFT JOIN analyses a ON a.content_item_id = ci.id
    WHERE ci.order_id = ${orderId}
    ORDER BY ci.created_at
  `) as any[]

  const todo = items.filter((i) => rerun || !i.analyzed)
  if (todo.length === 0) {
    return { analyzed: 0, failed: 0, message: 'Nothing new to analyze' }
  }

  if (['consent_completed', 'collecting'].includes(order.status)) {
    await sql`UPDATE orders SET status = 'analysis', updated_at = NOW() WHERE id = ${orderId}`
  }
  await audit(actor, 'analysis.started', orderId, {
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

  if (failed === 0) {
    await sql`UPDATE orders SET status = 'in_review', updated_at = NOW() WHERE id = ${orderId}`
  }
  await audit(actor, 'analysis.finished', orderId, { analyzed: ok, failed })
  return { analyzed: ok, failed }
}
