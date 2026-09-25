'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Analyst-entered details for one profile: these fill the report's
// "Social media profiles" table (name, handle, bio, following/followers/posts).
export function ProfileDetails({
  orderId,
  profile,
  onDone,
}: {
  orderId: number
  profile: any
  onDone: () => void
}) {
  const router = useRouter()
  const [d, setD] = useState({
    display_name: profile.display_name || '',
    handle: profile.handle || '',
    bio: profile.bio || '',
    following: profile.following ?? '',
    followers: profile.followers ?? '',
    post_count: profile.post_count ?? '',
    is_private: !!profile.is_private,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_profile', profile_id: profile.id, details: d }),
    })
    setBusy(false)
    if (res.ok) {
      router.refresh()
      onDone()
    } else {
      setError((await res.json().catch(() => ({}))).error || 'Save failed')
    }
  }

  const input = 'w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm'
  return (
    <div className="mt-2 border-t border-gray-100 pt-3 space-y-3">
      <p className="text-xs text-gray-500">
        Copy these from the public profile page. All optional; blanks show as
        &ldquo;–&rdquo; in the report.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">
          Display name
          <input className={input} value={d.display_name} onChange={(e) => setD({ ...d, display_name: e.target.value })} placeholder="Julia Smith" />
        </label>
        <label className="text-xs text-gray-500">
          Username / handle
          <input className={input} value={d.handle} onChange={(e) => setD({ ...d, handle: e.target.value })} placeholder="Taken from the link if blank" />
        </label>
      </div>
      <label className="block text-xs text-gray-500">
        Bio / headline
        <input className={input} value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} placeholder="Dog mom | Adventure lover" />
      </label>
      <div className="grid grid-cols-3 gap-3">
        {([
          ['following', 'Following'],
          ['followers', 'Followers'],
          ['post_count', 'Posts'],
        ] as const).map(([k, label]) => (
          <label key={k} className="text-xs text-gray-500">
            {label}
            <input className={input} inputMode="numeric" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={d.is_private} onChange={(e) => setD({ ...d, is_private: e.target.checked })} />
        Account is private (no posts could be reviewed)
      </label>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button onClick={onDone} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
        <button
          onClick={save}
          disabled={busy}
          className="bg-astblue-600 hover:bg-astblue-700 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </div>
  )
}
