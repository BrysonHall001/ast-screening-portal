import { sql } from './db'
import { CATEGORY_LABELS } from './categories'

// ============================================================================
// The report's "Flagged post summary" paragraph.
//
// Same rule as the rest of the product: AI may DRAFT, a human decides. The
// draft is built only from analyst-confirmed, unsuppressed items, and it
// reaches a report only after an analyst saves it (orders.report_summary).
// If nobody saves one, the report uses fallbackSummary() — a plain,
// non-AI description of the confirmed flag counts.
// ============================================================================

const API_BASE = () =>
  (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '')
const MODEL = () => process.env.OPENAI_MODEL || 'gpt-6-astra'

export function firstName(full: string): string {
  return (full || '').trim().split(/\s+/)[0] || 'The subject'
}

export function fallbackSummary(
  candidateName: string,
  counts: Map<string, number>
): string {
  const first = firstName(candidateName)
  if (counts.size === 0) {
    return `No publicly available content matching the screened behavioral categories was confirmed for ${first} within the lookback window.`
  }
  const parts = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${(CATEGORY_LABELS[k] || k).toLowerCase()} (${n})`)
  const list =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
  return `An analyst reviewed ${first}'s publicly available posts and confirmed flags in the following categories: ${list}. Each flagged post is shown in full on the following pages so the end user can evaluate it in context.`
}

export async function draftSummary(orderId: number): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set, so AI drafting is unavailable. You can still type a summary yourself.')

  const orders = (await sql`SELECT candidate_name FROM orders WHERE id = ${orderId}`) as any[]
  if (!orders[0]) throw new Error('Order not found')
  const items = (await sql`
    SELECT ci.platform, ci.posted_at, ci.content_text, a.final_flags
    FROM content_items ci JOIN analyses a ON a.content_item_id = ci.id
    WHERE ci.order_id = ${orderId} AND a.suppressed = FALSE
      AND a.final_flags IS NOT NULL AND jsonb_array_length(a.final_flags) > 0
    ORDER BY ci.posted_at DESC NULLS LAST
    LIMIT 60
  `) as any[]
  if (items.length === 0) {
    return fallbackSummary(orders[0].candidate_name, new Map())
  }
  const first = firstName(orders[0].candidate_name)
  const lines = items.map((it, i) => {
    const cats = (it.final_flags || []).map((f: any) => CATEGORY_LABELS[f.category] || f.category).join(', ')
    const text = String(it.content_text || '(image only)').replace(/\s+/g, ' ').slice(0, 400)
    return `${i + 1}. [${it.platform}] [${cats}] ${text}`
  })

  const system = `You write the "Flagged Post Summary" paragraph of an FCRA-regulated pre-employment social media screening report. You will receive only posts that a human analyst has already confirmed as flagged.

Write ONE paragraph of 3–5 sentences, refer to the subject by first name ("${first}"), in the style: "${first}'s posts cover ... She/He/They expresses views on ... Her/His/Their posts also touch on ... The tone is often ...". Use "they" unless the posts make pronouns obvious.

Rules:
- Describe only what the posts show: topics, themes, and observable tone. No guesses about character, motives, fitness for a job, or mental/physical health.
- Never mention race, ethnicity, religion, health, disability, sexual orientation, gender identity, pregnancy, age, or union activity.
- No recommendations, no hiring language, no quotes longer than three words.
- Plain text only. No headings, lists, or markdown.`

  const res = await fetch(`${API_BASE()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Confirmed flagged posts:\n${lines.join('\n')}` },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = String(data.choices?.[0]?.message?.content || '').trim()
  if (!text) throw new Error('The AI returned an empty draft — try again or write one yourself.')
  return text.replace(/^["']|["']$/g, '').slice(0, 3000)
}
