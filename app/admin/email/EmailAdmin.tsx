'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, CheckCircle2, AlertTriangle, Send } from 'lucide-react'

interface LogRow {
  id: number
  to_address: string
  subject: string
  method: string
  status: 'sent' | 'failed' | 'logged'
  error: string | null
  created_at: string
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const METHOD_LABEL: Record<string, string> = {
  microsoft: 'Microsoft 365',
  smtp: 'SMTP (password)',
  log: 'Not set up — emails go to the Render log',
}

export function EmailAdmin({
  method,
  from,
  selfEmail,
  log,
}: {
  method: 'microsoft' | 'smtp' | 'log'
  from: string
  selfEmail: string
  log: LogRow[]
}) {
  const router = useRouter()
  const [to, setTo] = useState(selfEmail)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function sendTest() {
    setBusy(true)
    setResult(null)
    const res = await fetch('/api/email/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    setResult(
      res.ok
        ? { ok: true, text: `Sent to ${data.to}. Check that inbox (and its junk folder).` }
        : { ok: false, text: data.error || 'The test email failed.' }
    )
    router.refresh()
  }

  const configured = method !== 'log'

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-white mb-2">Email</h1>

      <section className="bg-white rounded-xl shadow-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
          <Mail size={16} className="text-astblue-600" /> Sending setup
        </h2>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm mb-5">
          <div>
            <div className="text-xs text-gray-400">Method</div>
            <div className={configured ? 'text-gray-800 font-medium' : 'text-amber-700 font-medium'}>
              {METHOD_LABEL[method]}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Sends from</div>
            <div className="text-gray-800">{from}</div>
          </div>
        </div>
        {!configured && (
          <p className="text-xs text-gray-500 mb-4">
            Add MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MAIL_FROM in
            Render → Environment, then redeploy. The README&apos;s Email section
            walks through getting those values from Microsoft 365.
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@allstartalent.us"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={sendTest}
            disabled={busy || !to}
            className="inline-flex items-center gap-1.5 bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          >
            <Send size={14} /> {busy ? 'Sending…' : 'Send test email'}
          </button>
        </div>
        {result && (
          <div
            className={
              'mt-3 text-sm rounded-lg px-3 py-2 flex gap-2 items-start ' +
              (result.ok
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200')
            }
          >
            {result.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
            <span className="break-words">{result.text}</span>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-card p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Recent emails</h2>
        {log.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {log.map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      'text-xs px-2 py-0.5 rounded-full shrink-0 ' +
                      (r.status === 'sent'
                        ? 'bg-green-50 text-green-700'
                        : r.status === 'failed'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-gray-100 text-gray-500')
                    }
                  >
                    {r.status === 'logged' ? 'not sent (logged)' : r.status}
                  </span>
                  <span className="text-gray-800 truncate flex-1">{r.subject}</span>
                  <span className="text-xs text-gray-400 shrink-0">{fmt(r.created_at)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">to {r.to_address}</div>
                {r.error && <div className="text-xs text-red-600 mt-1 break-words">{r.error}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
