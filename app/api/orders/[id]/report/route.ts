import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { buildReportPdf } from '@/lib/report'
import { newConsentToken } from '@/lib/tokens'
import { normalizeCategories } from '@/lib/categories'

export const maxDuration = 300

// Generate (or regenerate) the report PDF for a signed-off screening.
export async function POST(
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
  const orders = (await sql`
    SELECT o.*, c.name AS client_name, c.keywords AS client_keywords,
           su.full_name AS signed_off_by_name
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    LEFT JOIN users su ON su.id = o.signed_off_by
    WHERE o.id = ${id}
  `) as any[]
  const order = orders[0]
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['report_ready', 'delivered'].includes(order.status)) {
    return NextResponse.json(
      { error: 'The review must be signed off before generating a report' },
      { status: 400 }
    )
  }

  const consents = (await sql`SELECT * FROM consents WHERE order_id = ${id}`) as any[]
  if (!consents[0]) {
    return NextResponse.json({ error: 'No consent on file' }, { status: 400 })
  }
  const profiles = (await sql`
    SELECT platform, url, added_by, display_name, handle, bio,
           following, followers, post_count, is_private
    FROM candidate_profiles WHERE order_id = ${id} ORDER BY created_at
  `) as any[]

  // Every reviewed, unsuppressed post (flagged or not): word cloud + stats.
  const reviewedPosts = (await sql`
    SELECT ci.platform, ci.posted_at, ci.content_text
    FROM content_items ci
    JOIN analyses a ON a.content_item_id = ci.id
    WHERE ci.order_id = ${id}
      AND a.suppressed = FALSE
      AND a.final_flags IS NOT NULL
  `) as any[]
  const discoveryRan = ((await sql`
    SELECT EXISTS (
      SELECT 1 FROM audit_log WHERE order_id = ${id} AND action = 'discovery.finished'
    ) AS ran
  `) as any[])[0].ran === true

  // THE inclusion query: not suppressed, human-reviewed, flags confirmed.
  const items = (await sql`
    SELECT ci.platform, ci.url, ci.posted_at, ci.content_text, ci.image, ci.image_mime,
           a.final_flags, a.reviewer_note, a.redact_image
    FROM content_items ci
    JOIN analyses a ON a.content_item_id = ci.id
    WHERE ci.order_id = ${id}
      AND a.suppressed = FALSE
      AND a.final_flags IS NOT NULL
      AND jsonb_array_length(a.final_flags) > 0
    ORDER BY ci.posted_at DESC NULLS LAST, ci.created_at
  `) as any[]

  const cats = normalizeCategories(order.categories)
  const pdf = await buildReportPdf({
    orderId: order.id,
    candidateName: order.candidate_name,
    clientName: order.client_name,
    jobTitle: order.job_title,
    lookbackYears: order.lookback_years,
    enabledCategoryKeys: Object.keys(cats).filter((k) => cats[k]),
    keywords: order.client_keywords || '',
    identifiers: {
      email: order.candidate_email || null,
      location: order.candidate_location || null,
      phone: order.candidate_phone || null,
      company: order.candidate_company || null,
      highSchool: order.candidate_high_school || null,
      college: order.candidate_college || null,
    },
    profiles,
    discoveryRan,
    reviewedPosts,
    approvedSummary: order.report_summary || null,
    consent: consents[0],
    signedOffByName: order.signed_off_by_name || 'Analyst',
    signedOffAt: order.signed_off_at,
    items: items.map((i) => ({
      ...i,
      image: i.image ? Buffer.from(i.image) : null,
      final_flags: i.final_flags || [],
    })),
  })

  const version = ((await sql`
    SELECT COALESCE(MAX(version), 0)::int AS v FROM reports WHERE order_id = ${id}
  `) as any[])[0].v + 1

  const rows = (await sql`
    INSERT INTO reports (order_id, version, pdf, share_token, candidate_token, generated_by)
    VALUES (${id}, ${version}, ${pdf}, ${newConsentToken()}, ${newConsentToken()}, ${user.id})
    RETURNING id, version, generated_at
  `) as any[]
  await audit(user.email, 'report.generated', id, {
    report_id: rows[0].id, version, flagged_items: items.length, bytes: pdf.length,
  })
  return NextResponse.json({ report: rows[0] })
}

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
  const reports = await sql`
    SELECT r.id, r.version, r.generated_at, r.delivered_to, r.delivered_at,
           u.full_name AS generated_by_name
    FROM reports r LEFT JOIN users u ON u.id = r.generated_by
    WHERE r.order_id = ${id} ORDER BY r.version DESC
  `
  return NextResponse.json({ reports })
}
