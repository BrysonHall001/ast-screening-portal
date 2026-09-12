'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, CheckCircle2, ShieldOff, Plus, ExternalLink,
  ClipboardCheck, EyeOff, RotateCcw,
} from 'lucide-react'
import clsx from 'clsx'
import { StatusPill } from '@/components/StatusPill'
import { CATEGORIES, CATEGORY_LABELS, normalizeCategories } from '@/lib/categories'
import type { Order, AnalysisFlag } from '@/lib/types'

interface ItemRow {
  id: number
  platform: string
  url: string | null
  posted_at: string | null
  content_text: string | null
  has_image: boolean
  flags: AnalysisFlag[] | null
  suppressed: boolean | null
  suppression_reason: string | null
  analysis_error: string | null
  analyzed_at: string | null
  final_flags?: AnalysisFlag[] | null
  reviewed_at?: string | null
  reviewer_note?: string | null
  redact_image?: boolean
}

// Per-item local edit state.
interface Draft {
  kept: Record<number, boolean> // index into ai flags → kept?
  added: AnalysisFlag[]
  note: string
  redact: boolean
  saving: boolean
}

export function ReviewQueue({
  order,
}: {
  order: Order & { client_name: string }
}) {
  const router = useRouter()
  const [items, setItems] = useState<ItemRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState('')
  const [status, setStatus] = useState(order.status)
  const [signing, setSigning] = useState(false)

  const enabledKeys = Object.entries(normalizeCategories(order.categories))
    .filter(([, v]) => v)
    .map(([k]) => k)
    .concat(['keywords'])

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${order.id}/items`)
    if (res.ok) {
      const data = await res.json()
      const rows: ItemRow[] = data.items
      setItems(rows)
      const d: Record<number, Draft> = {}
      for (const it of rows) {
        const kept: Record<number, boolean> = {}
        ;(it.flags || []).forEach((_, i) => (kept[i] = true))
        d[it.id] = {
          kept,
          added: [],
          note: it.reviewer_note || '',
          redact: it.redact_image || false,
          saving: false,
        }
      }
      setDrafts(d)
    }
    setLoading(false)
  }, [order.id])

  useEffect(() => { load() }, [load])

  function setDraft(id: number, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function saveReview(item: ItemRow) {
    const d = drafts[item.id]
    if (!d) return
    setDraft(item.id, { saving: true })
    const finalFlags = (item.flags || [])
      .filter((_, i) => d.kept[i])
      .concat(d.added)
    const res = await fetch(`/api/items/${item.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        final_flags: finalFlags,
        reviewer_note: d.note || null,
        redact_image: d.redact,
      }),
    })
    setDraft(item.id, { saving: false })
    if (res.ok) load()
    else {
      const data = await res.json().catch(() => ({}))
      setFlash(data.error || 'Failed to save review')
    }
  }

  async function restore(item: ItemRow) {
    if (!confirm('Restore this suppressed item for review? Only do this if the suppression was a mistake (the content is NOT actually about a protected characteristic).')) return
    const res = await fetch(`/api/items/${item.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restore: true }),
    })
    if (res.ok) load()
  }

  async function signOff() {
    if (!confirm('Sign off this review? This locks all item reviews and marks the screening Report Ready.')) return
    setSigning(true)
    const res = await fetch(`/api/orders/${order.id}/signoff`, { method: 'POST' })
    setSigning(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setStatus('report_ready')
      setFlash('Review signed off — the screening is Report Ready.')
      router.refresh()
    } else {
      setFlash(data.error || 'Sign-off failed')
    }
  }

  const reviewable = items.filter((i) => i.analyzed_at && !i.suppressed)
  const suppressedItems = items.filter((i) => i.suppressed)
  const reviewedCount = reviewable.filter((i) => i.reviewed_at).length
  const allReviewed = reviewable.length > 0 && reviewedCount === reviewable.length
  const locked = ['report_ready', 'delivered'].includes(status)

  return (
    <div className="max-w-4xl">
      <Link
        href={`/admin/orders/${order.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-4"
      >
        <ArrowLeft size={15} /> Back to screening
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Review · {order.candidate_name}
          </h1>
          <p className="text-sm text-white/60">
            {order.client_name} · {reviewedCount}/{reviewable.length} items reviewed
            {suppressedItems.length > 0 && ` · ${suppressedItems.length} suppressed`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          {!locked && (
            <button
              onClick={signOff}
              disabled={!allReviewed || signing}
              className="inline-flex items-center gap-1.5 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              title={allReviewed ? '' : 'Review every item first'}
            >
              <ClipboardCheck size={15} />
              {signing ? 'Signing off…' : 'Sign off review'}
            </button>
          )}
        </div>
      </div>

      {flash && (
        <div className="mb-4 bg-astblue-50 border border-astblue-200 text-astblue-900 text-sm rounded-lg px-4 py-2.5">
          {flash}
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl shadow-card p-8 text-center text-sm text-gray-400">Loading…</div>
      )}
      {!loading && reviewable.length === 0 && suppressedItems.length === 0 && (
        <div className="bg-white rounded-xl shadow-card p-8 text-center text-sm text-gray-400">
          Nothing analyzed yet — run analysis from the capture workspace first.
        </div>
      )}

      <div className="space-y-3">
        {reviewable.map((item) => {
          const d = drafts[item.id]
          if (!d) return null
          const aiFlags = item.flags || []
          return (
            <div key={item.id} className="bg-white rounded-xl shadow-card p-5">
              <div className="flex items-start gap-4">
                {item.has_image && (
                  <a href={`/api/items/${item.id}/image`} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/items/${item.id}/image`}
                      alt="capture"
                      className={clsx('w-24 h-24 object-cover rounded-lg border border-gray-200', d.redact && 'blur-sm')}
                    />
                  </a>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <span className="font-medium text-gray-600">{item.platform}</span>
                    {item.posted_at && <span>{new Date(item.posted_at).toLocaleDateString('en-US')}</span>}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-astblue-700 hover:underline inline-flex items-center gap-0.5">
                        source <ExternalLink size={10} />
                      </a>
                    )}
                    {item.reviewed_at && (
                      <span className="ml-auto inline-flex items-center gap-1 text-astblue-700">
                        <CheckCircle2 size={12} /> reviewed
                      </span>
                    )}
                  </div>
                  {item.content_text && (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mb-3">
                      {item.content_text}
                    </p>
                  )}

                  {/* AI flags → keep/reject */}
                  <div className="space-y-1.5 mb-3">
                    {aiFlags.length === 0 && (
                      <p className="text-xs text-gray-400">
                        AI found nothing. Confirm it&apos;s clean, or add a missed flag below.
                      </p>
                    )}
                    {aiFlags.map((f, i) => (
                      <label
                        key={i}
                        className={clsx(
                          'flex items-start gap-2.5 text-sm rounded-lg border p-2.5 cursor-pointer transition-colors',
                          d.kept[i]
                            ? 'border-astblue-300 bg-astblue-50/50'
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={!!d.kept[i]}
                          disabled={locked}
                          onChange={(e) =>
                            setDraft(item.id, { kept: { ...d.kept, [i]: e.target.checked } })
                          }
                          className="mt-0.5 w-4 h-4 accent-[#f87c04]"
                        />
                        <span>
                          <strong>{CATEGORY_LABELS[f.category] || f.category}</strong>
                          <span className="text-gray-400"> · {Math.round(f.confidence * 100)}%</span>
                          <span className="block text-xs text-gray-500">{f.rationale}</span>
                        </span>
                      </label>
                    ))}
                    {d.added.map((f, i) => (
                      <div key={`a${i}`} className="flex items-center gap-2 text-sm rounded-lg border border-astblue-300 bg-astblue-50/50 p-2.5">
                        <strong>{CATEGORY_LABELS[f.category] || f.category}</strong>
                        <span className="text-xs text-gray-500 flex-1">added by reviewer</span>
                        {!locked && (
                          <button
                            onClick={() =>
                              setDraft(item.id, { added: d.added.filter((_, j) => j !== i) })
                            }
                            className="text-xs text-red-500 hover:underline"
                          >
                            remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {!locked && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return
                          setDraft(item.id, {
                            added: [
                              ...d.added,
                              { category: e.target.value, confidence: 1, rationale: 'Added on human review.' },
                            ],
                          })
                          e.target.value = ''
                        }}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                      >
                        <option value="">+ Add missed flag…</option>
                        {CATEGORIES.filter((c) => enabledKeys.includes(c.key)).map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                        <option value="keywords">Keyword match</option>
                      </select>
                      {item.has_image && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={d.redact}
                            onChange={(e) => setDraft(item.id, { redact: e.target.checked })}
                            className="w-3.5 h-3.5 accent-[#f87c04]"
                          />
                          <EyeOff size={12} /> Redact image in report
                        </label>
                      )}
                      <input
                        value={d.note}
                        onChange={(e) => setDraft(item.id, { note: e.target.value })}
                        placeholder="Reviewer note (appears in report)…"
                        className="flex-1 min-w-40 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                      <button
                        onClick={() => saveReview(item)}
                        disabled={d.saving}
                        className="bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-3.5 py-1.5 text-xs font-medium disabled:opacity-60"
                      >
                        {d.saving ? 'Saving…' : item.reviewed_at ? 'Update review' : 'Save review'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {suppressedItems.length > 0 && (
          <details className="bg-white/90 rounded-xl shadow-card">
            <summary className="px-5 py-3.5 text-sm text-gray-600 cursor-pointer select-none flex items-center gap-2">
              <ShieldOff size={15} className="text-gray-400" />
              {suppressedItems.length} suppressed item{suppressedItems.length === 1 ? '' : 's'} (excluded from reports)
            </summary>
            <div className="border-t border-gray-100 p-5 space-y-3">
              {suppressedItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 text-sm text-gray-500">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-400 mb-0.5">{item.platform} · {item.suppression_reason}</div>
                    {item.content_text && (
                      <p className="text-xs text-gray-400 truncate">{item.content_text}</p>
                    )}
                  </div>
                  {!locked && (
                    <button
                      onClick={() => restore(item)}
                      className="inline-flex items-center gap-1 text-xs text-astblue-700 hover:underline shrink-0"
                      title="Only if suppression was a mistake"
                    >
                      <RotateCcw size={11} /> Restore
                    </button>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-400">
                Suppressed items contain protected-class information and can never
                appear in a report. Restore one only if the AI made a mistake — the
                restored item goes back through analysis-level review and the
                override is audited.
              </p>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
