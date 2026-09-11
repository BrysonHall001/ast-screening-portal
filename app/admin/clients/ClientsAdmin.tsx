'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronDown, ChevronRight, Save } from 'lucide-react'
import clsx from 'clsx'
import { CategoryToggles } from '@/components/CategoryToggles'
import { normalizeCategories } from '@/lib/categories'
import type { Client } from '@/lib/types'

export function ClientsAdmin({
  initialClients,
}: {
  initialClients: (Client & { order_count: number })[]
}) {
  const router = useRouter()
  const [openId, setOpenId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(initialClients.length === 0)
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Local edit state for the open client panel
  const [editCats, setEditCats] = useState<Record<string, boolean>>({})
  const [editKeywords, setEditKeywords] = useState('')
  const [saved, setSaved] = useState(false)

  function openClient(c: Client & { order_count: number }) {
    if (openId === c.id) {
      setOpenId(null)
      return
    }
    setOpenId(c.id)
    setEditCats(normalizeCategories(c.categories))
    setEditKeywords(c.keywords || '')
    setSaved(false)
  }

  async function createClient(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        contact_name: contactName,
        contact_email: contactEmail,
      }),
    })
    setBusy(false)
    if (res.ok) {
      setName('')
      setContactName('')
      setContactEmail('')
      setShowCreate(false)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to create client')
    }
  }

  async function saveSettings(id: number) {
    setBusy(true)
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: editCats, keywords: editKeywords }),
    })
    setBusy(false)
    if (res.ok) {
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Clients</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New client
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={createClient}
          className="bg-white rounded-xl shadow-card p-5 mb-4 space-y-4"
        >
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact name
              </label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
              />
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {busy ? 'Creating…' : 'Create client'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {initialClients.length === 0 && !showCreate && (
          <div className="bg-white rounded-xl shadow-card p-8 text-center text-sm text-gray-400">
            No clients yet.
          </div>
        )}
        {initialClients.map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow-card overflow-hidden">
            <button
              onClick={() => openClient(c)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-astblue-50/40 transition-colors"
            >
              {openId === c.id ? (
                <ChevronDown size={16} className="text-gray-400" />
              ) : (
                <ChevronRight size={16} className="text-gray-400" />
              )}
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">{c.name}</div>
                <div className="text-xs text-gray-400">
                  {c.contact_name || 'No contact'}
                  {c.contact_email ? ` · ${c.contact_email}` : ''}
                </div>
              </div>
              <div className="text-xs text-gray-400">
                {c.order_count} screening{c.order_count === 1 ? '' : 's'}
              </div>
            </button>
            {openId === c.id && (
              <div className="border-t border-gray-100 p-5">
                <h3 className="text-sm font-medium text-gray-800 mb-1">
                  Default behavior categories
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  New screenings for this client start from these settings.
                </p>
                <CategoryToggles value={editCats} onChange={setEditCats} />
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom keywords <span className="text-gray-400">(comma separated, used by Phase 2 analysis)</span>
                  </label>
                  <input
                    value={editKeywords}
                    onChange={(e) => setEditKeywords(e.target.value)}
                    placeholder="e.g. competitor names, industry-specific terms"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
                  />
                </div>
                <div className="mt-4 flex justify-end items-center gap-3">
                  {saved && <span className="text-xs text-astblue-700">Saved ✓</span>}
                  <button
                    onClick={() => saveSettings(c.id)}
                    disabled={busy}
                    className={clsx(
                      'inline-flex items-center gap-1.5 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60'
                    )}
                  >
                    <Save size={15} /> Save settings
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
