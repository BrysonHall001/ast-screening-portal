'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Trash2, ExternalLink, Sparkles, ShieldOff,
  ImageIcon, AlertCircle, RefreshCw, Bot, Search, Check, X,
} from 'lucide-react'
import clsx from 'clsx'
import { StatusPill } from '@/components/StatusPill'
import { CATEGORY_LABELS } from '@/lib/categories'
import type { Order, CandidateProfile, AnalysisFlag } from '@/lib/types'

const PLATFORMS = [
  'Facebook','Instagram','X (Twitter)','LinkedIn','TikTok','Reddit',
  'YouTube','Pinterest','Threads','Other',
]

// Chip colors loosely follow severity.
const FLAG_COLORS: Record<string, string> = {
  threats: '#e2445c',
  violence_gory: '#bb3354',
  weapons: '#a25ddc',
  prejudice: '#ff642e',
  disparaging: '#fdab3d',
  drug_alcohol: '#ff9d48',
  drug_image: '#ff7575',
  nudity: '#c4162a',
  suggestive: '#df2f4a',
  profanity: '#784bd1',
  rude_gestures: '#9d50dd',
  self_harm: '#5559df',
  politics: '#579bfc',
  keywords: '#00c875',
}

interface ItemRow {
  id: number
  source?: string
  platform: string
  url: string | null
  posted_at: string | null
  content_text: string | null
  has_image: boolean
  captured_by_name: string | null
  created_at: string
  flags: AnalysisFlag[] | null
  suppressed: boolean | null
  suppression_reason: string | null
  model: string | null
  analysis_error: string | null
  analyzed_at: string | null
}

export function CaptureWorkspace({
  order,
  profiles,
}: {
  order: Order & { client_name: string; client_keywords: string }
  profiles: CandidateProfile[]
}) {
  const [items, setItems] = useState<ItemRow[]>([])
  const [status, setStatus] = useState(order.status)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [lastRun, setLastRun] = useState<any | null>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [deciding, setDeciding] = useState(0)
  const [liveProfiles, setLiveProfiles] = useState(profiles)

  // Add form state
  const [showAdd, setShowAdd] = useState(false)
  const [platform, setPlatform] = useState(profiles[0]?.platform || 'Facebook')
  const [url, setUrl] = useState('')
  const [postedAt, setPostedAt] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${order.id}/items`)
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
    }
    const runsRes = await fetch(`/api/orders/${order.id}/collect`)
    if (runsRes.ok) {
      const runsData = await runsRes.json()
      setLastRun(runsData.runs?.[0] || null)
    }
    const discRes = await fetch(`/api/orders/${order.id}/discover`)
    if (discRes.ok) {
      const discData = await discRes.json()
      setSuggestions(discData.suggestions || [])
    }
    setLoading(false)
  }, [order.id])

  useEffect(() => { load() }, [load])

  function pickFile(f: File | null) {
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    if (!text.trim() && !file) {
      setAddError('Provide the post text, a screenshot, or both.')
      return
    }
    setSaving(true)
    const form = new FormData()
    form.set('platform', platform)
    form.set('url', url)
    form.set('posted_at', postedAt)
    form.set('content_text', text)
    if (file) form.set('image', file)
    const res = await fetch(`/api/orders/${order.id}/items`, {
      method: 'POST',
      body: form,
    })
    setSaving(false)
    if (res.ok) {
      setUrl(''); setPostedAt(''); setText(''); pickFile(null)
      if (fileRef.current) fileRef.current.value = ''
      if (status === 'consent_completed') setStatus('collecting')
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setAddError(data.error || 'Failed to save')
    }
  }

  async function removeItem(id: number) {
    if (!confirm('Delete this captured item?')) return
    await fetch(`/api/items/${id}`, { method: 'DELETE' })
    load()
  }

  async function discover() {
    setDiscovering(true)
    setFlash('')
    const res = await fetch(`/api/orders/${order.id}/discover`, { method: 'POST' })
    setDiscovering(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setFlash(
        data.suggestions.length
          ? `Discovery found ${data.suggestions.length} possible profile${data.suggestions.length === 1 ? '' : 's'} — confirm the ones that are really this candidate.`
          : 'Discovery found no additional likely profiles.'
      )
      load()
    } else {
      setFlash(data.error || 'Discovery failed')
    }
  }

  async function decideSuggestion(id: number, action: 'confirm' | 'reject') {
    setDeciding(id)
    const res = await fetch(`/api/discovered/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setDeciding(0)
    if (res.ok) {
      if (action === 'confirm') {
        const s = suggestions.find((x) => x.id === id)
        if (s) setLiveProfiles([...liveProfiles, { id: -id, order_id: order.id, platform: s.platform, url: s.url, added_by: 'analyst', created_at: '' } as any])
        setFlash('Profile confirmed and attached — run Auto-collect to gather its content.')
      }
      load()
    }
  }

  async function autoCollect() {
    setCollecting(true)
    setFlash('')
    const res = await fetch(`/api/orders/${order.id}/collect`, { method: 'POST' })
    setCollecting(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const walled = (data.results || []).filter((r: any) => r.status === 'walled').length
      setFlash(
        `Auto-collect done: ${data.collected} item${data.collected === 1 ? '' : 's'} captured` +
          (data.analysis ? ` and analyzed (${data.analysis.analyzed} ok${data.analysis.failed ? `, ${data.analysis.failed} failed` : ''})` : '') +
          (walled ? `. ${walled} profile${walled === 1 ? '' : 's'} behind a login wall — capture those manually.` : '.')
      )
      if (data.analysis && data.analysis.failed === 0 && data.analysis.analyzed > 0) setStatus('in_review')
      else if (data.collected > 0 && status === 'consent_completed') setStatus('collecting')
      load()
    } else {
      setFlash(data.error || 'Auto-collect failed')
    }
  }

  async function runAnalysis(rerun: boolean) {
    setAnalyzing(true)
    setFlash('')
    const res = await fetch(`/api/orders/${order.id}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rerun }),
    })
    setAnalyzing(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setFlash(
        data.message ||
          `Analysis done: ${data.analyzed} item${data.analyzed === 1 ? '' : 's'} analyzed${data.failed ? `, ${data.failed} failed` : ''}.`
      )
      if (data.failed === 0 && data.analyzed > 0) setStatus('in_review')
      load()
    } else {
      setFlash(data.error || 'Analysis failed')
    }
  }

  const unanalyzed = items.filter((i) => !i.analyzed_at).length
  const flagged = items.filter((i) => (i.flags?.length || 0) > 0).length
  const suppressed = items.filter((i) => i.suppressed).length

  return (
    <div>
      <Link
        href={`/admin/orders/${order.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-4"
      >
        <ArrowLeft size={15} /> Back to screening
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Capture · {order.candidate_name}
          </h1>
          <p className="text-sm text-white/60">
            {order.client_name} · {items.length} item{items.length === 1 ? '' : 's'} captured
            {flagged > 0 && ` · ${flagged} flagged`}
            {suppressed > 0 && ` · ${suppressed} suppressed`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <button
            onClick={autoCollect}
            disabled={collecting || liveProfiles.length === 0}
            className="inline-flex items-center gap-1.5 border border-astblue-300 text-astblue-100 hover:bg-white/10 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            title={liveProfiles.length === 0 ? 'No profiles on this screening' : 'Visit the candidate\'s public profiles and capture recent posts automatically'}
          >
            <Bot size={15} className={collecting ? 'animate-pulse' : ''} />
            {collecting ? 'Collecting…' : 'Auto-collect'}
          </button>
          <button
            onClick={() => runAnalysis(false)}
            disabled={analyzing || items.length === 0}
            className="inline-flex items-center gap-1.5 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Sparkles size={15} className={analyzing ? 'animate-pulse' : ''} />
            {analyzing
              ? 'Analyzing…'
              : unanalyzed > 0
                ? `Analyze ${unanalyzed} new item${unanalyzed === 1 ? '' : 's'}`
                : 'Analyze'}
          </button>
        </div>
      </div>

      {flash && (
        <div className="mb-4 bg-astblue-50 border border-astblue-200 text-astblue-900 text-sm rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
          <span>{flash}</span>
          {items.some((i) => i.analyzed_at) && (
            <button
              onClick={() => runAnalysis(true)}
              disabled={analyzing}
              className="inline-flex items-center gap-1 text-xs text-astblue-700 hover:underline shrink-0"
            >
              <RefreshCw size={12} /> Re-run all
            </button>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-3">
          {/* Add item */}
          <div className="bg-white rounded-xl shadow-card overflow-hidden">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="w-full flex items-center gap-2 px-5 py-3.5 text-sm font-medium text-gray-700 hover:bg-astblue-50/40"
            >
              <Plus size={16} className="text-astblue-600" />
              Capture a post
            </button>
            {showAdd && (
              <form onSubmit={addItem} className="border-t border-gray-100 p-5 space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                  >
                    {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Post URL (optional)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Post date (if known)</label>
                    <input
                      type="date"
                      value={postedAt}
                      onChange={(e) => setPostedAt(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Screenshot</label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => pickFile(e.target.files?.[0] || null)}
                      className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-astblue-50 file:px-3 file:py-2 file:text-sm file:text-astblue-800"
                    />
                  </div>
                </div>
                {preview && (
                  <img src={preview} alt="preview" className="max-h-40 rounded-lg border border-gray-200" />
                )}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  placeholder="Paste the post's text content here…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {addError && <div className="text-sm text-red-600">{addError}</div>}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save item'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Items */}
          {loading && (
            <div className="bg-white rounded-xl shadow-card p-8 text-center text-sm text-gray-400">
              Loading…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="bg-white rounded-xl shadow-card p-8 text-center text-sm text-gray-400">
              Nothing captured yet. Open the candidate&apos;s profiles on the right and
              capture anything relevant to the enabled categories.
            </div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className={clsx(
                'bg-white rounded-xl shadow-card p-4',
                item.suppressed && 'opacity-80'
              )}
            >
              <div className="flex items-start gap-3">
                {item.has_image ? (
                  <a href={`/api/items/${item.id}/image`} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/items/${item.id}/image`}
                      alt="capture"
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                    />
                  </a>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                    <ImageIcon size={18} className="text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <span className="font-medium text-gray-600">{item.platform}</span>
                    {item.posted_at && <span>posted {new Date(item.posted_at).toLocaleDateString('en-US')}</span>}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-astblue-700 hover:underline inline-flex items-center gap-0.5">
                        source <ExternalLink size={10} />
                      </a>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1">
                      {item.source === 'auto' ? (
                        <span className="inline-flex items-center gap-1 text-astblue-700"><Bot size={11} /> auto</span>
                      ) : (
                        item.captured_by_name
                      )}
                    </span>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-gray-300 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {item.content_text && (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mb-2">
                      {item.content_text}
                    </p>
                  )}

                  {/* Analysis state */}
                  {item.suppressed ? (
                    <div className="flex items-start gap-1.5 text-xs bg-gray-100 border border-gray-200 text-gray-600 rounded-md p-2">
                      <ShieldOff size={13} className="shrink-0 mt-px" />
                      <span>
                        <strong>Suppressed</strong> — {item.suppression_reason}. This item is
                        barred from reports.
                      </span>
                    </div>
                  ) : item.analysis_error ? (
                    <div className="flex items-start gap-1.5 text-xs bg-red-50 border border-red-100 text-red-700 rounded-md p-2">
                      <AlertCircle size={13} className="shrink-0 mt-px" />
                      <span>Analysis failed: {item.analysis_error}</span>
                    </div>
                  ) : item.analyzed_at ? (
                    (item.flags?.length || 0) > 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          {item.flags!.map((f, i) => (
                            <span
                              key={i}
                              className="pill"
                              style={{ backgroundColor: FLAG_COLORS[f.category] || '#c4c4c4' }}
                              title={f.rationale}
                            >
                              {CATEGORY_LABELS[f.category] || f.category}
                              <span className="ml-1.5 opacity-75">{Math.round(f.confidence * 100)}%</span>
                            </span>
                          ))}
                        </div>
                        <details className="text-xs text-gray-500">
                          <summary className="cursor-pointer select-none">Why</summary>
                          <ul className="mt-1 space-y-0.5 list-disc pl-4">
                            {item.flags!.map((f, i) => (
                              <li key={i}>
                                <strong>{CATEGORY_LABELS[f.category] || f.category}:</strong> {f.rationale}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">Analyzed — no flags.</div>
                    )
                  ) : (
                    <div className="text-xs text-gray-400">Not analyzed yet.</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar: candidate's profiles */}
        <div className="space-y-4">
          <section className="bg-white rounded-xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              Profiles to review
            </h2>
            {liveProfiles.length === 0 && (
              <p className="text-sm text-gray-400">
                The candidate didn&apos;t list any — run Discover below, or add
                analyst-verified profiles from the screening page.
              </p>
            )}
            <ul className="space-y-2">
              {liveProfiles.map((p) => {
                const run = lastRun?.results?.find((r: any) => r.url === p.url)
                return (
                  <li key={p.id} className="text-sm">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 border border-gray-100 hover:border-astblue-300 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span className="font-medium text-gray-700 w-24 shrink-0">{p.platform}</span>
                      <span className="text-astblue-700 truncate flex-1">{p.url}</span>
                      <ExternalLink size={12} className="text-gray-300 shrink-0" />
                    </a>
                    {run && (
                      <div
                        className={
                          'mt-1 text-xs px-3 ' +
                          (run.status === 'collected'
                            ? 'text-astblue-700'
                            : run.status === 'walled'
                              ? 'text-amber-700'
                              : 'text-gray-400')
                        }
                      >
                        {run.status === 'collected' && `✓ auto-collected ${run.items} — ${run.note}`}
                        {run.status === 'walled' && `⚠ ${run.note}`}
                        {run.status === 'empty' && run.note}
                        {run.status === 'error' && `✗ ${run.note}`}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="bg-white rounded-xl shadow-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-800">Discovered profiles</h2>
              <button
                onClick={discover}
                disabled={discovering}
                className="inline-flex items-center gap-1 text-xs text-astblue-700 hover:underline disabled:opacity-50"
              >
                <Search size={12} className={discovering ? 'animate-pulse' : ''} />
                {discovering ? 'Searching…' : 'Discover'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Profiles the system found searching the candidate&apos;s name, email
              handle, and location. <strong>Confirm only ones you&apos;re confident are
              really this person</strong> — screening a same-named stranger is the
              #1 accuracy failure in this industry.
            </p>
            {suggestions.filter((s) => s.status === 'suggested').length === 0 && (
              <p className="text-xs text-gray-400">Nothing awaiting a decision.</p>
            )}
            <ul className="space-y-2">
              {suggestions.filter((s) => s.status === 'suggested').map((s) => (
                <li key={s.id} className="border border-gray-100 rounded-lg p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">{s.platform}</span>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-astblue-700 hover:underline truncate flex-1">
                      {s.url}
                    </a>
                    <span className="text-gray-300">score {s.score}</span>
                  </div>
                  <p className="text-gray-500 mt-1">{s.evidence}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => decideSuggestion(s.id, 'confirm')}
                      disabled={deciding === s.id}
                      className="inline-flex items-center gap-1 bg-astblue-600 hover:bg-astblue-700 text-white rounded-md px-2.5 py-1 disabled:opacity-50"
                    >
                      <Check size={11} /> This is them
                    </button>
                    <button
                      onClick={() => decideSuggestion(s.id, 'reject')}
                      disabled={deciding === s.id}
                      className="inline-flex items-center gap-1 border border-gray-200 hover:border-red-300 hover:text-red-600 text-gray-500 rounded-md px-2.5 py-1 disabled:opacity-50"
                    >
                      <X size={11} /> Not them
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white rounded-xl shadow-card p-5 text-xs text-gray-500 space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">Capture rules</h2>
            <p>Public content only — never log into the candidate&apos;s accounts or view private content.</p>
            <p>Capture the post as-is: screenshot plus the text. The AI flags candidates for review; nothing reaches a report without human confirmation.</p>
            <p>Content revealing protected characteristics gets auto-suppressed. Don&apos;t capture it deliberately.</p>
            <p>Stay inside the {order.lookback_years}-year lookback window.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
