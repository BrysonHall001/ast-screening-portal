'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CategoryToggles } from '@/components/CategoryToggles'
import { normalizeCategories } from '@/lib/categories'
import type { Client } from '@/lib/types'

export function NewOrderForm({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const [clientId, setClientId] = useState<number | ''>('')
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [candidateLocation, setCandidateLocation] = useState('')
  const [lookback, setLookback] = useState(7)
  const [extra, setExtra] = useState({ phone: '', company: '', high_school: '', college: '' })
  const [categories, setCategories] = useState(normalizeCategories(null))
  const [sendNow, setSendNow] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function pickClient(idStr: string) {
    const id = idStr ? Number(idStr) : ''
    setClientId(id)
    const client = clients.find((c) => c.id === id)
    // Snapshot the client's category defaults into this order.
    setCategories(normalizeCategories(client?.categories ?? null))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!clientId) {
      setError('Pick a client first (or create one on the Clients page).')
      return
    }
    setBusy(true)
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        candidate_location: candidateLocation || null,
        job_title: jobTitle || null,
        candidate_phone: extra.phone,
        candidate_company: extra.company,
        candidate_high_school: extra.high_school,
        candidate_college: extra.college,
        lookback_years: lookback,
        categories,
        send_now: sendNow,
      }),
    })
    setBusy(false)
    if (res.ok) {
      const data = await res.json()
      if (data.email_error) {
        alert(
          `The screening was created, but the consent email did not send:\n\n${data.email_error}\n\nYou can use \"Copy consent link\" on the next page to send it yourself.`
        )
      }
      router.push(`/admin/orders/${data.id}`)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to create screening')
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-white mb-6">New screening</h1>
      <form onSubmit={submit} className="bg-white rounded-xl shadow-card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
          <select
            value={clientId}
            onChange={(e) => pickClient(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-astblue-400"
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {clients.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              No clients yet — <Link href="/admin/clients" className="text-astblue-700 hover:underline">create one first</Link>.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Candidate full name
            </label>
            <input
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Candidate email
            </label>
            <input
              type="email"
              value={candidateEmail}
              onChange={(e) => setCandidateEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job title <span className="text-gray-400">(optional)</span>
            </label>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City / state <span className="text-gray-400">(optional — sharpens profile discovery)</span>
            </label>
            <input
              value={candidateLocation}
              onChange={(e) => setCandidateLocation(e.target.value)}
              placeholder="e.g. Raleigh, NC"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lookback window (years)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={lookback}
              onChange={(e) => setLookback(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
            />
            <p className="text-xs text-gray-400 mt-1">7 years is the standard default.</p>
          </div>
        </div>

        <details className="border border-gray-200 rounded-lg px-4 py-3">
          <summary className="text-sm font-medium text-gray-700 cursor-pointer">
            More identifiers <span className="text-gray-400 font-normal">(optional — listed in the report under &ldquo;Subject properties provided&rdquo;)</span>
          </summary>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {([
              ['phone', 'Phone number'],
              ['company', 'Current / recent employer'],
              ['high_school', 'High school'],
              ['college', 'College'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="block text-sm text-gray-600 mb-1">{label}</label>
                <input
                  value={extra[key]}
                  onChange={(e) => setExtra({ ...extra, [key]: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
                />
              </div>
            ))}
          </div>
        </details>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Behavior categories for this screening
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Preloaded from the client&apos;s defaults. Changes here apply to this
            screening only.
          </p>
          <CategoryToggles value={categories} onChange={setCategories} />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={sendNow}
            onChange={(e) => setSendNow(e.target.checked)}
            className="w-4 h-4 accent-[#f87c04]"
          />
          <span className="text-sm text-gray-700">
            Email the consent link to the candidate now
          </span>
        </label>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/admin"
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {busy ? 'Creating…' : sendNow ? 'Create and send consent' : 'Create as draft'}
          </button>
        </div>
      </form>
    </div>
  )
}
