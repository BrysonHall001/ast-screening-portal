'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, CheckCircle2, Plus, Trash2, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { Background } from '@/components/Background'
import { PoweredBy } from '@/components/PoweredBy'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','Other/Non-US',
]

const PLATFORMS = [
  'Facebook','Instagram','X (Twitter)','LinkedIn','TikTok','Reddit',
  'YouTube','Pinterest','Threads','Other',
]

interface LegalText {
  version: string
  disclosure: string
  authorization: string
  california_notice: string
  fcra_rights_url: string
  profiles_note: string
}

interface ConsentState {
  candidate_name: string
  client_name: string
  status: string
  completed: boolean
  cancelled: boolean
  legal: LegalText
}

type ProfileRow = { platform: string; url: string }

export function ConsentFlow({ token }: { token: string }) {
  const [state, setState] = useState<ConsentState | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [step, setStep] = useState(1) // 1 disclosure, 2 authorization, 3 profiles, 4 done
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Step 2 fields
  const [signature, setSignature] = useState('')
  const [residence, setResidence] = useState('')
  const [wantsCopy, setWantsCopy] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [authorized, setAuthorized] = useState(false)

  // Step 3 fields
  const [profiles, setProfiles] = useState<ProfileRow[]>([{ platform: 'Facebook', url: '' }])

  useEffect(() => {
    fetch(`/api/consent/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ConsentState) => {
        setState(data)
        if (data.completed) setStep(4)
      })
      .catch(() => setNotFound(true))
  }, [token])

  async function submitSignature() {
    setError('')
    if (!acknowledged || !authorized) {
      setError('Please check both boxes to continue.')
      return
    }
    if (signature.trim().length < 3) {
      setError('Please type your full legal name to sign.')
      return
    }
    setBusy(true)
    const res = await fetch(`/api/consent/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: 'sign',
        signature_name: signature.trim(),
        state_of_residence: residence || null,
        wants_copy: wantsCopy,
        acknowledged,
        authorized,
      }),
    })
    setBusy(false)
    if (res.ok) {
      setStep(3)
      window.scrollTo(0, 0)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Something went wrong. Please try again.')
    }
  }

  async function submitProfiles(skip: boolean) {
    setError('')
    setBusy(true)
    const clean = skip
      ? []
      : profiles.filter((p) => p.url.trim().length > 0)
    const res = await fetch(`/api/consent/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'profiles', profiles: clean }),
    })
    setBusy(false)
    if (res.ok) {
      setStep(4)
      window.scrollTo(0, 0)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Something went wrong. Please try again.')
    }
  }

  function card(children: React.ReactNode) {
    return (
      <Background variant="auth">
        <div className="min-h-screen flex items-start justify-center px-4 py-10">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-card p-6 sm:p-10">
            {children}
          </div>
        </div>
        <PoweredBy tone="light" />
      </Background>
    )
  }

  if (notFound) {
    return card(
      <div className="text-center py-10">
        <h1 className="text-lg font-semibold text-gray-800 mb-2">Link not found</h1>
        <p className="text-sm text-gray-500">
          This screening link is invalid or no longer active. If you believe
          this is an error, contact the company that sent it to you.
        </p>
      </div>
    )
  }

  if (!state) {
    return card(
      <div className="text-center py-10 text-sm text-gray-400">Loading…</div>
    )
  }

  if (state.cancelled) {
    return card(
      <div className="text-center py-10">
        <h1 className="text-lg font-semibold text-gray-800 mb-2">
          This screening was cancelled
        </h1>
        <p className="text-sm text-gray-500">
          No action is needed, and nothing will be reviewed.
        </p>
      </div>
    )
  }

  const stepsBar = (
    <div className="flex items-center gap-2 mb-8">
      {['Disclosure', 'Authorization', 'Your accounts', 'Done'].map((label, i) => {
        const n = i + 1
        return (
          <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                step > n
                  ? 'bg-astblue-600 text-white'
                  : step === n
                    ? 'bg-astblue-100 text-astblue-800 ring-2 ring-astblue-400'
                    : 'bg-gray-100 text-gray-400'
              )}
            >
              {step > n ? '✓' : n}
            </div>
            <span
              className={clsx(
                'text-xs truncate hidden sm:block',
                step === n ? 'text-gray-800 font-medium' : 'text-gray-400'
              )}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )

  // ---- Step 1: standalone disclosure (nothing else on this screen) ----
  if (step === 1) {
    return card(
      <>
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={22} className="text-astblue-600" />
          <h1 className="text-lg font-semibold text-gray-800">
            Background screening for {state.client_name}
          </h1>
        </div>
        {stepsBar}
        <p className="text-sm text-gray-600 mb-4">
          Hi {state.candidate_name.split(' ')[0]} — before anything is
          reviewed, federal law requires that you receive this disclosure as
          a standalone document. Please read it carefully.
        </p>
        <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 max-h-96 overflow-y-auto scroll-thin whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
          {state.legal.disclosure}
        </div>
        <a
          href={state.legal.fcra_rights_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-astblue-700 hover:underline mt-3"
        >
          Summary of Your Rights Under the FCRA <ExternalLink size={13} />
        </a>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => {
              setStep(2)
              window.scrollTo(0, 0)
            }}
            className="bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors"
          >
            Continue to authorization
          </button>
        </div>
      </>
    )
  }

  // ---- Step 2: authorization + e-signature ----
  if (step === 2) {
    return card(
      <>
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={22} className="text-astblue-600" />
          <h1 className="text-lg font-semibold text-gray-800">Authorization</h1>
        </div>
        {stepsBar}
        <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 max-h-72 overflow-y-auto scroll-thin whitespace-pre-wrap text-sm text-gray-700 leading-relaxed mb-4">
          {state.legal.authorization}
        </div>
        <details className="mb-5">
          <summary className="text-sm text-astblue-700 cursor-pointer select-none">
            California notice (click to read)
          </summary>
          <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-4 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
            {state.legal.california_notice}
          </div>
        </details>

        <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#f87c04]"
          />
          <span className="text-sm text-gray-700">
            I acknowledge that I received and read the standalone disclosure.
          </span>
        </label>
        <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#f87c04]"
          />
          <span className="text-sm text-gray-700">
            I authorize the screening described in the disclosure.
          </span>
        </label>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type your full legal name to sign
            </label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={state.candidate_name}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State of residence
            </label>
            <select
              value={residence}
              onChange={(e) => setResidence(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-astblue-400"
            >
              <option value="">Select…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2.5 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={wantsCopy}
            onChange={(e) => setWantsCopy(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#f87c04]"
          />
          <span className="text-sm text-gray-700">
            Send me a free copy of any report prepared about me.
          </span>
        </label>

        {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

        <div className="flex justify-between">
          <button
            onClick={() => setStep(1)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to disclosure
          </button>
          <button
            onClick={submitSignature}
            disabled={busy}
            className="bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {busy ? 'Signing…' : 'Sign and continue'}
          </button>
        </div>
      </>
    )
  }

  // ---- Step 3: candidate-provided profiles ----
  if (step === 3) {
    return card(
      <>
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={22} className="text-astblue-600" />
          <h1 className="text-lg font-semibold text-gray-800">Your accounts</h1>
        </div>
        {stepsBar}
        <p className="text-sm text-gray-600 mb-2">
          Listing your public social media accounts helps make sure the review
          looks at <em>your</em> content — not someone else with the same name.
        </p>
        <p className="text-xs text-gray-500 mb-5">{state.legal.profiles_note}</p>

        <div className="space-y-2 mb-4">
          {profiles.map((p, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={p.platform}
                onChange={(e) => {
                  const next = [...profiles]
                  next[i] = { ...next[i], platform: e.target.value }
                  setProfiles(next)
                }}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white w-36 shrink-0 focus:outline-none focus:ring-2 focus:ring-astblue-400"
              >
                {PLATFORMS.map((pl) => (
                  <option key={pl} value={pl}>{pl}</option>
                ))}
              </select>
              <input
                value={p.url}
                onChange={(e) => {
                  const next = [...profiles]
                  next[i] = { ...next[i], url: e.target.value }
                  setProfiles(next)
                }}
                placeholder="https://…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-astblue-400"
              />
              {profiles.length > 1 && (
                <button
                  onClick={() => setProfiles(profiles.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 px-1"
                  title="Remove"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setProfiles([...profiles, { platform: 'Instagram', url: '' }])}
          className="inline-flex items-center gap-1.5 text-sm text-astblue-700 hover:underline mb-6"
        >
          <Plus size={15} /> Add another account
        </button>

        {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

        <div className="flex justify-between items-center">
          <button
            onClick={() => submitProfiles(true)}
            disabled={busy}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-60"
          >
            Skip this step
          </button>
          <button
            onClick={() => submitProfiles(false)}
            disabled={busy}
            className="bg-astblue-600 hover:bg-astblue-700 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {busy ? 'Submitting…' : 'Finish'}
          </button>
        </div>
      </>
    )
  }

  // ---- Step 4: done ----
  return card(
    <div className="text-center py-8">
      <CheckCircle2 size={44} className="text-astblue-600 mx-auto mb-4" />
      <h1 className="text-lg font-semibold text-gray-800 mb-2">All set</h1>
      <p className="text-sm text-gray-600 max-w-md mx-auto">
        Your authorization is complete, and a copy has been emailed to you for
        your records. You have the right to request a copy of any report and to
        dispute anything inaccurate — the email explains how.
      </p>
      <p className="text-xs text-gray-400 mt-6">
        You can close this page.
      </p>
    </div>
  )
}
