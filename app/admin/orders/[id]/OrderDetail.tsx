'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Copy, Mail, XCircle, Plus, Trash2, FileSignature,
  ExternalLink, ScrollText, Camera,
} from 'lucide-react'
import { StatusPill } from '@/components/StatusPill'
import { DeliveryPanel } from './DeliveryPanel'
import { CategoryToggles } from '@/components/CategoryToggles'
import { normalizeCategories } from '@/lib/categories'
import type { Order, Consent, CandidateProfile, AuditEntry } from '@/lib/types'

interface Bundle {
  order: Order & { contact_email?: string | null; purged_at?: string | null }
  consent: Consent | null
  profiles: CandidateProfile[]
  audit: AuditEntry[]
  itemCount: number
  reports: any[]
  adverse: any
  disputes: any[]
  isAdmin: boolean
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function OrderDetail({ initial }: { initial: Bundle }) {
  const router = useRouter()
  const { order, consent, profiles, audit, itemCount, reports, adverse, disputes, isAdmin } = initial
  const [busy, setBusy] = useState('')
  const [flash, setFlash] = useState('')
  const [newPlatform, setNewPlatform] = useState('Facebook')
  const [newUrl, setNewUrl] = useState('')

  const consentLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/consent/${order.consent_token}`
      : ''

  async function act(action: string, extra: Record<string, any> = {}) {
    setBusy(action)
    const res = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    setBusy('')
    if (res.ok) router.refresh()
    else {
      const data = await res.json().catch(() => ({}))
      setFlash(data.error || 'Action failed')
    }
  }

  async function resend() {
    setBusy('resend')
    const res = await fetch(`/api/orders/${order.id}/resend`, { method: 'POST' })
    setBusy('')
    if (res.ok) {
      setFlash('Consent email sent.')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setFlash(data.error || 'Failed to send')
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(consentLink)
    setFlash('Consent link copied to clipboard.')
  }

  const consentOpen = !order.consent_completed_at && order.status !== 'cancelled'

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-4"
      >
        <ArrowLeft size={15} /> All screenings
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">{order.candidate_name}</h1>
          <p className="text-sm text-white/60">
            {order.client_name}
            {order.job_title ? ` · ${order.job_title}` : ''} · {order.lookback_years}-year lookback
          </p>
        </div>
        <StatusPill status={order.status} />
      </div>

      {flash && (
        <div className="mb-4 bg-astblue-50 border border-astblue-200 text-astblue-900 text-sm rounded-lg px-4 py-2.5">
          {flash}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {/* Consent record */}
          <section className="bg-white rounded-xl shadow-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
              <FileSignature size={16} className="text-astblue-600" /> Consent record
            </h2>
            {consent ? (
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <div className="text-xs text-gray-400">Signed by</div>
                  <div className="text-gray-800 font-medium">{consent.signature_name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Signed at</div>
                  <div className="text-gray-800">{fmt(consent.signed_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Disclosure version</div>
                  <div className="text-gray-800">{consent.disclosure_version}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">State of residence</div>
                  <div className="text-gray-800">{consent.state_of_residence || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Wants report copy</div>
                  <div className="text-gray-800">{consent.wants_copy ? 'Yes' : 'No'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">IP address</div>
                  <div className="text-gray-800">{consent.ip || '—'}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Not signed yet.
                <div className="mt-1 text-xs text-gray-400">
                  Sent: {fmt(order.consent_sent_at)} · First viewed: {fmt(order.consent_viewed_at)}
                </div>
              </div>
            )}
          </section>

          {/* Profiles */}
          <section className="bg-white rounded-xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">
              Social profiles ({profiles.length})
            </h2>
            {profiles.length === 0 && (
              <p className="text-sm text-gray-400 mb-3">None yet.</p>
            )}
            <ul className="space-y-2 mb-4">
              {profiles.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="font-medium text-gray-700 w-28 shrink-0">{p.platform}</span>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-astblue-700 hover:underline truncate flex-1 inline-flex items-center gap-1"
                  >
                    <span className="truncate">{p.url}</span>
                    <ExternalLink size={12} className="shrink-0" />
                  </a>
                  <span className="text-xs text-gray-400 shrink-0">
                    {p.added_by === 'candidate' ? 'Candidate' : 'Analyst'}
                  </span>
                  <button
                    onClick={() => act('remove_profile', { profile_id: p.id })}
                    className="text-gray-300 hover:text-red-500"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white w-32 shrink-0"
              >
                {['Facebook','Instagram','X (Twitter)','LinkedIn','TikTok','Reddit','YouTube','Pinterest','Threads','Other'].map((pl) => (
                  <option key={pl}>{pl}</option>
                ))}
              </select>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://… (analyst-verified profile)"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => {
                  if (newUrl) {
                    act('add_profile', { platform: newPlatform, url: newUrl })
                    setNewUrl('')
                  }
                }}
                disabled={busy === 'add_profile'}
                className="inline-flex items-center gap-1 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </section>

          {/* Categories snapshot */}
          <section className="bg-white rounded-xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">
              Behavior categories (locked at order time)
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              This snapshot governs the Phase 2 analysis for this screening.
            </p>
            <CategoryToggles
              value={normalizeCategories(order.categories)}
              onChange={() => {}}
              disabled
            />
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <section className="bg-white rounded-xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Actions</h2>
            <div className="space-y-2">
              {consentOpen && (
                <>
                  <button
                    onClick={resend}
                    disabled={busy === 'resend'}
                    className="w-full inline-flex items-center justify-center gap-2 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    <Mail size={15} />
                    {order.consent_sent_at ? 'Resend consent email' : 'Send consent email'}
                  </button>
                  <button
                    onClick={copyLink}
                    className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 hover:border-astblue-400 text-gray-700 rounded-lg px-4 py-2 text-sm transition-colors"
                  >
                    <Copy size={15} /> Copy consent link
                  </button>
                </>
              )}
              {['consent_completed', 'collecting', 'analysis', 'in_review'].includes(order.status) && (
                <Link
                  href={`/admin/orders/${order.id}/capture`}
                  className="w-full inline-flex items-center justify-center gap-2 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  <Camera size={15} /> Capture workspace{itemCount > 0 ? ` (${itemCount})` : ''}
                </Link>
              )}
              {['analysis', 'in_review'].includes(order.status) && (
                <Link
                  href={`/admin/orders/${order.id}/review`}
                  className="w-full inline-flex items-center justify-center gap-2 border border-astblue-300 text-astblue-800 hover:bg-astblue-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Review queue
                </Link>
              )}
              {['report_ready', 'delivered'].includes(order.status) && (
                <Link
                  href={`/admin/orders/${order.id}/review`}
                  className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:border-astblue-300 rounded-lg px-4 py-2 text-sm transition-colors"
                >
                  View locked review
                </Link>
              )}
              {order.status !== 'cancelled' && (
                <button
                  onClick={() => {
                    if (confirm('Cancel this screening? The consent link will stop working.')) {
                      act('cancel')
                    }
                  }}
                  disabled={busy === 'cancel'}
                  className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 hover:border-red-300 hover:text-red-600 text-gray-500 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
                >
                  <XCircle size={15} /> Cancel screening
                </button>
              )}
            </div>
          </section>

          <DeliveryPanel
            order={order as any}
            isAdmin={isAdmin}
            contactEmail={order.contact_email || null}
            reports={reports}
            adverse={adverse}
            disputes={disputes}
          />

          <section className="bg-white rounded-xl shadow-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
              <ScrollText size={15} className="text-astblue-600" /> Audit trail
            </h2>
            <ul className="space-y-2 max-h-96 overflow-y-auto scroll-thin">
              {audit.length === 0 && (
                <li className="text-sm text-gray-400">No events yet.</li>
              )}
              {audit.map((a) => (
                <li key={a.id} className="text-xs border-l-2 border-astblue-200 pl-2.5 py-0.5">
                  <div className="text-gray-700">{a.action}</div>
                  <div className="text-gray-400">
                    {a.actor} · {fmt(a.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
