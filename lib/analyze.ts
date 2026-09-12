import { CATEGORIES } from './categories'
import type { AnalysisFlag } from './types'

// ============================================================================
// The analysis engine. One content item in → structured flags out.
//
// Two-layer compliance design:
//   Layer 1: the model is only ALLOWED to flag the categories enabled for
//            this specific order (the snapshot taken at order time).
//   Layer 2: the suppression filter. If content reveals protected-class
//            information (race, religion, health, disability, sexual
//            orientation, pregnancy, union activity — or political views /
//            self-harm when those categories are disabled), the item is
//            marked suppressed. Suppressed items are stored for the audit
//            trail but are barred from reports at the database level: Phase
//            4's report generator excludes them by query, not by trust.
//
// Every AI result is a *recommendation* — Phase 3's human review queue is
// where flags get confirmed or rejected before anything reaches a report.
// ============================================================================

const API_BASE = () =>
  (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '')
const MODEL = () => process.env.OPENAI_MODEL || 'gpt-6-astra'

export interface AnalyzeInput {
  platform: string
  postedAt: string | null
  contentText: string | null
  imageBase64: string | null
  imageMime: string | null
}

export interface AnalyzeResult {
  flags: AnalysisFlag[]
  suppressed: boolean
  suppression_reason: string | null
  model: string
}

function buildSystemPrompt(
  enabledKeys: string[],
  keywords: string
): string {
  const enabled = CATEGORIES.filter((c) => enabledKeys.includes(c.key))
  const categoryList = enabled
    .map((c) => `- "${c.key}": ${c.label} — ${c.description}`)
    .join('\n')
  const kw = keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

  return `You are a content classifier for a consumer reporting agency performing FCRA-regulated pre-employment social media screening. You analyze ONE piece of publicly available social media content at a time and return strict JSON.

ALLOWED CATEGORIES (you may ONLY flag these exact keys):
${categoryList}
${kw.length ? `- "keywords": the content contains one of these client-specified keywords or a close variant: ${kw.join(', ')}` : ''}

RULES:
1. Flag conduct, never identity. A slur ATTACKING a group is flaggable conduct by the author; a person's OWN identity, appearance, or group membership is never flaggable.
2. SUPPRESSION (overrides everything): if the content's primary informational value is revealing a protected characteristic of the subject — their race, ethnicity, religion, health or medical condition, disability, sexual orientation, gender identity, pregnancy, age, or union membership/activity — set "suppressed": true. Also suppress content revealing the subject's political views or affiliations, and content about the subject's own mental health or self-harm, UNLESS a matching category appears in the allowed list above. Suppressed content must have an empty flags array and a brief neutral "suppression_reason" that does NOT restate the protected information in detail (e.g. "reveals protected characteristic (health)").
3. Only flag what is actually present. An empty flags array is the correct answer for benign content. Do not stretch.
4. "confidence" is your honest 0.0–1.0 estimate. "rationale" is one factual sentence describing what is observable, quoting at most a short fragment.
5. If an image is provided, analyze it together with any text.
6. Respond with ONLY a JSON object, no markdown fences, no commentary:
{"flags":[{"category":"<allowed key>","confidence":0.0,"rationale":"..."}],"suppressed":false,"suppression_reason":null}`
}

function parseResult(raw: string, allowedKeys: string[]): Omit<AnalyzeResult, 'model'> {
  // Strip accidental code fences and find the JSON object.
  let text = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON in model response')
  const parsed = JSON.parse(text.slice(start, end + 1))

  const suppressed = parsed.suppressed === true
  const flags: AnalysisFlag[] = []
  if (!suppressed && Array.isArray(parsed.flags)) {
    for (const f of parsed.flags) {
      if (!f || typeof f.category !== 'string') continue
      if (!allowedKeys.includes(f.category)) continue // hard drop unknown keys
      const conf = Math.min(Math.max(Number(f.confidence) || 0, 0), 1)
      flags.push({
        category: f.category,
        confidence: Math.round(conf * 100) / 100,
        rationale: String(f.rationale || '').slice(0, 500),
      })
    }
  }
  return {
    flags,
    suppressed,
    suppression_reason: suppressed
      ? String(parsed.suppression_reason || 'reveals protected information').slice(0, 300)
      : null,
  }
}

export async function analyzeItem(
  input: AnalyzeInput,
  enabledKeys: string[],
  keywords: string
): Promise<AnalyzeResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to your environment to enable AI analysis.'
    )
  }
  const hasKeywords = keywords.split(',').some((k) => k.trim())
  const allowedKeys = hasKeywords ? [...enabledKeys, 'keywords'] : enabledKeys

  const content: any[] = [
    {
      type: 'text',
      text: `Platform: ${input.platform}
Posted: ${input.postedAt || 'unknown date'}
Text content: ${input.contentText?.trim() || '(none — image only)'}`,
    },
  ]
  if (input.imageBase64 && input.imageMime) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${input.imageMime};base64,${input.imageBase64}`,
      },
    })
  }

  const res = await fetch(`${API_BASE()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(enabledKeys, keywords) },
        { role: 'user', content },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  return { ...parseResult(text, allowedKeys), model: data.model || MODEL() }
}
