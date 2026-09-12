import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { normalizeCategories } from '@/lib/categories'
import type { AnalysisFlag } from '@/lib/types'

// Records the human decision on one analyzed item. final_flags becomes the
// only source of truth for reports.
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
  const itemId = Number(params.id)
  const body = await req.json().catch(() => ({}))

  const rows = (await sql`
    SELECT ci.order_id, a.id AS analysis_id, a.suppressed, o.categories, o.status
    FROM content_items ci
    JOIN analyses a ON a.content_item_id = ci.id
    JOIN orders o ON o.id = ci.order_id
    WHERE ci.id = ${itemId}
  `) as any[]
  const row = rows[0]
  if (!row) {
    return NextResponse.json({ error: 'Item not analyzed yet' }, { status: 404 })
  }
  if (['report_ready', 'delivered', 'cancelled'].includes(row.status)) {
    return NextResponse.json(
      { error: 'This screening is signed off — reviews are locked' },
      { status: 400 }
    )
  }

  // Restoring a wrongly-suppressed item (e.g. a real threat that happens to
  // mention a church). Explicit, separate, audited action.
  if (body.restore === true) {
    if (!row.suppressed) {
      return NextResponse.json({ error: 'Item is not suppressed' }, { status: 400 })
    }
    await sql`
      UPDATE analyses SET suppressed = FALSE, suppression_reason = NULL,
        final_flags = NULL, reviewed_by = NULL, reviewed_at = NULL
      WHERE id = ${row.analysis_id}
    `
    await audit(user.email, 'review.suppression_overridden', row.order_id, { item_id: itemId })
    return NextResponse.json({ ok: true })
  }

  if (row.suppressed) {
    return NextResponse.json(
      { error: 'Suppressed items cannot be reviewed into a report' },
      { status: 400 }
    )
  }

  // Validate final flags against this order's enabled categories.
  const cats = normalizeCategories(row.categories)
  const allowed = new Set(Object.keys(cats).filter((k) => cats[k]).concat(['keywords']))
  const finalFlags: AnalysisFlag[] = []
  if (Array.isArray(body.final_flags)) {
    for (const f of body.final_flags) {
      if (!f || typeof f.category !== 'string' || !allowed.has(f.category)) continue
      finalFlags.push({
        category: f.category,
        confidence: Math.min(Math.max(Number(f.confidence) || 1, 0), 1),
        rationale: String(f.rationale || '').slice(0, 500),
      })
    }
  }
  const note = body.reviewer_note ? String(body.reviewer_note).slice(0, 1000) : null
  const redact = body.redact_image === true

  await sql`
    UPDATE analyses SET
      final_flags = ${JSON.stringify(finalFlags)},
      reviewer_note = ${note},
      redact_image = ${redact},
      reviewed_by = ${user.id},
      reviewed_at = NOW()
    WHERE id = ${row.analysis_id}
  `
  await audit(user.email, 'review.item_reviewed', row.order_id, {
    item_id: itemId,
    final_flag_count: finalFlags.length,
    redact_image: redact,
  })
  return NextResponse.json({ ok: true })
}
