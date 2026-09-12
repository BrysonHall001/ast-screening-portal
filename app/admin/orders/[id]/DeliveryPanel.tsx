'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, Send, AlertTriangle, Scale, MessageSquareWarning,
  Trash, ClipboardCheck, ExternalLink,
} from 'lucide-react'
import type { Order } from '@/lib/types'

interface ReportMeta {
  id: number
  version: number
  generated_at: string
  generated_by_name: string | null
  delivered_to: string | null
  delivered_at: string | null
}

interface AdverseMeta {
  pre_adverse_sent_at: string | null
  adverse_sent_at: string | null
}

interface DisputeRow {
  id: number
  description: string
  status: 'open' | 'resolved'
  resolution: string | null
  opened_at: string
  resolved_at: string | null
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function businessDaysSince(ts: string): number {
  let d = new Date(ts)
  const now = new Date()
  let days = 0
  while (d < now) {
    d = new Date(d.getTime() + 86400000)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) days++
  }
  return days
}

export function DeliveryPanel({
  order,
  isAdmin,
  contactEmail,
  reports,
  adverse,
  disputes,
}: {
  order: Order
  isAdmin: boolean
  contactEmail: string | null
  reports: ReportMeta[]
  adverse: AdverseMeta | null
  disputes: DisputeRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [flash, setFlash] = useState('')
  const [deliverEmail, setDeliverEmail] = useState(contactEmail || '')
  const [disputeText, setDisputeText] = useState('')
  const [resolveText, setResolveText] = useState<Record<number, string>>({})

  const latest = reports[0]
  const purged = !!(order as any).purged_at

  async function call(label: string, url: string, body?: any) {
    setBusy(label)
    setFlash('')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    setBusy('')
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      router.refresh()
      return { ok: true, data }
    }
    setFlash(data.error || `${label} failed`)
    return { ok: false, data }
  }

  if (!['report_ready', 'delivered'].includes(order.status)) return null

  return (
    <>
      {flash && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-4 py-2.5">
          {flash}
        </div>
      )}

      {/* Report */}
      <section className="bg-white rounded-xl shadow-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
          <FileText size={16} className="text-astblue-600" /> Report
        </h2>
        {purged ? (
          <p className="text-sm text-gray-400">Screening data was purged; reports are gone.</p>
        ) : (
          <>
            {latest ? (
              <div className="text-sm text-gray-600 mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{latest.version}</span>
                  <span className="text-xs text-gray-400">
                    generated {fmt(latest.generated_at)} by {latest.generated_by_name}
                  </span>
                  <a
                    href={`/api/reports/${latest.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-astblue-700 hover:underline text-xs"
                  >
                    Preview PDF <ExternalLink size={11} />
                  </a>
                </div>
                {latest.delivered_at && (
                  <div className="text-xs text-gray-400 mt-1">
                    Delivered to {latest.delivered_to} — {fmt(latest.delivered_at)}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-3">Not generated yet.</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => call('generate', `/api/orders/${order.id}/report`)}
                disabled={busy === 'generate'}
                className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 hover:border-astblue-400 text-gray-700 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
              >
                <FileText size={15} />
                {busy === 'generate'
                  ? 'Generating…'
                  : latest ? 'Regenerate report (new version)' : 'Generate report'}
              </button>
              {latest && (
                <div className="flex gap-2">
                  <input
                    value={deliverEmail}
                    onChange={(e) => setDeliverEmail(e.target.value)}
                    placeholder="client@company.com"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() =>
                      call('deliver', `/api/orders/${order.id}/deliver`, { email: deliverEmail })
                    }
                    disabled={busy === 'deliver' || !deliverEmail}
                    className="inline-flex items-center gap-1.5 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    <Send size={14} /> {busy === 'deliver' ? 'Sending…' : order.status === 'delivered' ? 'Resend' : 'Deliver'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Adverse action */}
      {order.status === 'delivered' && !purged && (
        <section className="bg-white rounded-xl shadow-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
            <Scale size={16} className="text-astblue-600" /> Adverse action
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Only if the client is rejecting the candidate based on this report.
            Federal law requires both steps, in order, with a waiting period.
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700">1. Pre-adverse notice + report copy</span>
              {adverse?.pre_adverse_sent_at ? (
                <span className="text-xs text-astblue-700">{fmt(adverse.pre_adverse_sent_at)}</span>
              ) : (
                <button
                  onClick={() => {
                    if (confirm('Send the pre-adverse notice and report copy to the candidate?'))
                      call('pre', `/api/orders/${order.id}/adverse`, { step: 'pre' })
                  }}
                  disabled={busy === 'pre'}
                  className="border border-gray-200 hover:border-astblue-400 rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  {busy === 'pre' ? 'Sending…' : 'Send'}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700">2. Final adverse action notice</span>
              {adverse?.adverse_sent_at ? (
                <span className="text-xs text-astblue-700">{fmt(adverse.adverse_sent_at)}</span>
              ) : adverse?.pre_adverse_sent_at ? (
                <button
                  onClick={() => {
                    const days = businessDaysSince(adverse.pre_adverse_sent_at!)
                    const warn =
                      days < 5
                        ? `Only ${days} business day(s) since the pre-adverse notice. Most employers wait at least 5. Send anyway?`
                        : 'Send the final adverse action notice?'
                    if (confirm(warn))
                      call('final', `/api/orders/${order.id}/adverse`, { step: 'final' }).then((r) => {
                        if (!r.ok && r.data?.dispute_block) {
                          if (confirm('An OPEN DISPUTE exists. Sending the final notice with an unresolved dispute is legally risky. Override anyway?')) {
                            call('final', `/api/orders/${order.id}/adverse`, { step: 'final', override_dispute: true })
                          }
                        }
                      })
                  }}
                  disabled={busy === 'final'}
                  className="border border-gray-200 hover:border-red-300 hover:text-red-600 rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  {busy === 'final' ? 'Sending…' : 'Send'}
                </button>
              ) : (
                <span className="text-xs text-gray-400">after step 1</span>
              )}
            </div>
            {adverse?.pre_adverse_sent_at && !adverse?.adverse_sent_at && (
              <div className="flex items-start gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-md p-2">
                <AlertTriangle size={13} className="shrink-0 mt-px text-amber-500" />
                {businessDaysSince(adverse.pre_adverse_sent_at)} business day(s) since
                pre-adverse notice. Wait at least 5 before the final notice.
              </div>
            )}
          </div>
        </section>
      )}

      {/* Disputes */}
      {order.status === 'delivered' && (
        <section className="bg-white rounded-xl shadow-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
            <MessageSquareWarning size={16} className="text-astblue-600" /> Disputes
          </h2>
          <div className="space-y-2 mb-3">
            {disputes.length === 0 && (
              <p className="text-xs text-gray-400">None. When the candidate disputes something (by email or phone), log it here.</p>
            )}
            {disputes.map((d) => {
              const daysLeft = 30 - Math.floor((Date.now() - new Date(d.opened_at).getTime()) / 86400000)
              return (
                <div key={d.id} className="border border-gray-100 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="pill"
                      style={{ backgroundColor: d.status === 'open' ? '#e2445c' : '#00c875' }}
                    >
                      {d.status === 'open' ? 'Open' : 'Resolved'}
                    </span>
                    <span className="text-xs text-gray-400">opened {fmt(d.opened_at)}</span>
                    {d.status === 'open' && (
                      <span className={`text-xs ml-auto ${daysLeft < 7 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        {daysLeft} days left to reinvestigate
                      </span>
                    )}
                  </div>
                  <p className="text-gray-700 text-xs whitespace-pre-wrap">{d.description}</p>
                  {d.status === 'resolved' ? (
                    <p className="text-xs text-gray-500 mt-1.5">
                      <strong>Resolution ({fmt(d.resolved_at)}):</strong> {d.resolution}
                    </p>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <input
                        value={resolveText[d.id] || ''}
                        onChange={(e) => setResolveText({ ...resolveText, [d.id]: e.target.value })}
                        placeholder="Reinvestigation result…"
                        className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                      <button
                        onClick={async () => {
                          setBusy(`resolve${d.id}`)
                          const res = await fetch(`/api/disputes/${d.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'resolve', resolution: resolveText[d.id] }),
                          })
                          setBusy('')
                          if (res.ok) router.refresh()
                          else setFlash((await res.json().catch(() => ({}))).error || 'Failed')
                        }}
                        disabled={!resolveText[d.id] || busy === `resolve${d.id}`}
                        className="border border-gray-200 hover:border-astblue-400 rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <input
              value={disputeText}
              onChange={(e) => setDisputeText(e.target.value)}
              placeholder="What is the candidate disputing?"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={() =>
                call('dispute', `/api/orders/${order.id}/disputes`, { description: disputeText }).then(
                  (r) => r.ok && setDisputeText('')
                )
              }
              disabled={!disputeText.trim() || busy === 'dispute'}
              className="border border-gray-200 hover:border-astblue-400 rounded-lg px-3.5 py-2 text-sm disabled:opacity-60"
            >
              Log dispute
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Logging a dispute emails the candidate an acknowledgment and starts the
            30-day reinvestigation clock. If the report changes, regenerate and
            resend it above — their original link always serves the newest version.
          </p>
        </section>
      )}

      {/* Retention */}
      {isAdmin && order.status === 'delivered' && !purged && (
        <section className="bg-white rounded-xl shadow-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
            <Trash size={16} className="text-gray-400" /> Retention
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            When this screening no longer needs to be kept, purge deletes the
            captured posts, images, and report PDFs. The consent record and audit
            trail are kept as proof the screening was done lawfully. Irreversible.
          </p>
          <button
            onClick={() => {
              if (confirm('Permanently purge all captured content and reports for this screening? The consent record and audit trail are kept. This cannot be undone.'))
                call('purge', `/api/orders/${order.id}/purge`)
            }}
            disabled={busy === 'purge'}
            className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 hover:border-red-300 hover:text-red-600 text-gray-500 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
          >
            <Trash size={14} /> {busy === 'purge' ? 'Purging…' : 'Purge screening data'}
          </button>
        </section>
      )}
    </>
  )
}
