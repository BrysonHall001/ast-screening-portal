'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { Background } from '@/components/Background'

export default function SetupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, email, password }),
    })
    setBusy(false)
    if (res.ok) {
      router.push('/admin')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Setup failed')
    }
  }

  return (
    <Background variant="auth">
      <div className="min-h-screen flex items-center justify-center px-4">
        <form
          onSubmit={submit}
          className="w-full max-w-sm bg-white rounded-2xl shadow-card p-8"
        >
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={22} className="text-astblue-600" />
            <h1 className="text-lg font-semibold text-gray-800">First-time setup</h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Create the first admin account. This page locks itself once any
            user exists.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full name
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-astblue-400"
          />
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-astblue-400"
          />
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-astblue-400"
          />
          {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Create admin account'}
          </button>
        </form>
      </div>
    </Background>
  )
}
