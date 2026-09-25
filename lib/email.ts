import nodemailer from 'nodemailer'
import { sql } from './db'

// ============================================================================
// Outbound email. Three delivery methods, picked automatically from which
// environment variables are set (first match wins):
//
//   1. MICROSOFT 365 (recommended — works on Render's FREE plan)
//        MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_FROM
//      Sends through Microsoft Graph over HTTPS as the MAIL_FROM mailbox
//      (e.g. projects@allstartalent.us). Needs a one-time app registration
//      in the Microsoft 365 / Entra admin center — see README "Email".
//
//   2. SMTP with a password
//        SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//      For Outlook/M365: host smtp.office365.com, port 587. NOTE: Render's
//      free plan blocks SMTP ports, and Microsoft disables password SMTP by
//      default at the end of 2026 — so this is the fallback, not the plan.
//
//   3. Nothing configured → the email is printed to the Render log instead.
//
// Every attempt is written to email_log (Admin → Email shows it), so a
// failed send is never silent.
// ============================================================================

export type MailMethod = 'microsoft' | 'smtp' | 'log'

export function mailMethod(): MailMethod {
  if (process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET) {
    return 'microsoft'
  }
  if (process.env.SMTP_HOST) return 'smtp'
  return 'log'
}

export function mailFrom(): string {
  return (process.env.MAIL_FROM || 'screening@example.com').trim()
}

// ---------------- Microsoft Graph ----------------

// Never let a stalled connection hang a request: give up after 15 seconds.
async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Microsoft did not respond within ${ms / 1000} seconds. Try again in a minute.`)
    }
    throw new Error(`Could not reach Microsoft: ${String(err?.message || err)}`)
  } finally {
    clearTimeout(t)
  }
}

let _token: { value: string; expiresAt: number } | null = null

async function graphToken(): Promise<string> {
  if (_token && _token.expiresAt > Date.now() + 60_000) return _token.value
  const tenant = process.env.MS_TENANT_ID!.trim()
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!.trim(),
    client_secret: process.env.MS_CLIENT_SECRET!.trim(),
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetchWithTimeout(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  )
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Microsoft sign-in failed (${res.status}): ${data.error_description || data.error || 'unknown error'}`.slice(0, 400)
    )
  }
  _token = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3000) * 1000 }
  return _token.value
}

async function sendViaGraph(to: string, subject: string, text: string, replyTo?: string) {
  const token = await graphToken()
  const from = mailFrom()
  const res = await fetchWithTimeout(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: text },
          toRecipients: [{ emailAddress: { address: to } }],
          ...(replyTo ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
        },
        saveToSentItems: true,
      }),
    }
  )
  if (res.status !== 202 && !res.ok) {
    const data: any = await res.json().catch(() => ({}))
    const msg = data?.error?.message || data?.error?.code || 'unknown error'
    let hint = ''
    if (res.status === 403) hint = ' — the app registration is missing the Mail.Send application permission, or admin consent was not granted.'
    if (res.status === 404) hint = ` — Microsoft could not find the mailbox "${from}". Check MAIL_FROM.`
    throw new Error(`Microsoft send failed (${res.status}): ${msg}${hint}`.slice(0, 500))
  }
}

// ---------------- SMTP ----------------

async function sendViaSmtp(to: string, subject: string, text: string, replyTo?: string) {
  const port = Number(process.env.SMTP_PORT || 587)
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    connectionTimeout: 15000,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
  try {
    await t.sendMail({ from: mailFrom(), to, subject, text, replyTo })
  } catch (err: any) {
    const raw = String(err?.message || err)
    let hint = ''
    if (/ETIMEDOUT|ECONNREFUSED|timeout/i.test(raw)) {
      hint = ' — the connection was blocked. Render\'s free plan blocks SMTP; use the Microsoft 365 method instead.'
    } else if (/535|authentication|SmtpClientAuthentication/i.test(raw)) {
      hint = ' — Microsoft rejected the password. SMTP AUTH may be disabled for this mailbox, or the account uses multi-factor sign-in.'
    }
    throw new Error((raw + hint).slice(0, 500))
  }
}

// ---------------- Public API ----------------

export interface SendResult {
  ok: boolean
  method: MailMethod
  error?: string
}

async function logEmail(to: string, subject: string, r: SendResult) {
  try {
    await sql`
      INSERT INTO email_log (to_address, subject, method, status, error)
      VALUES (${to}, ${subject.slice(0, 300)}, ${r.method},
              ${r.method === 'log' ? 'logged' : r.ok ? 'sent' : 'failed'}, ${r.error || null})
    `
  } catch (err) {
    console.error('Could not write email_log:', err)
  }
}

// Never throws: callers keep working even if email is down. The result is
// returned (and logged) so screens can tell the user when a send failed.
export async function sendMail(opts: {
  to: string
  subject: string
  text: string
  replyTo?: string
}): Promise<SendResult> {
  const method = mailMethod()
  let result: SendResult
  if (method === 'log') {
    console.log(
      `\n=== EMAIL (email not configured; logging instead) ===\nTo: ${opts.to}\nFrom: ${mailFrom()}\nSubject: ${opts.subject}\n\n${opts.text}\n=== END EMAIL ===\n`
    )
    result = { ok: true, method }
  } else {
    try {
      if (method === 'microsoft') await sendViaGraph(opts.to, opts.subject, opts.text, opts.replyTo)
      else await sendViaSmtp(opts.to, opts.subject, opts.text, opts.replyTo)
      result = { ok: true, method }
    } catch (err: any) {
      console.error('Email send failed:', err)
      result = { ok: false, method, error: String(err?.message || err) }
    }
  }
  await logEmail(opts.to, opts.subject, result)
  return result
}

export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function consentInviteEmail(opts: {
  candidateName: string
  clientName: string
  link: string
}) {
  return {
    subject: `Action needed: authorize your pre-employment screening`,
    text: `Hi ${opts.candidateName},

As part of your application with ${opts.clientName}, you're being asked to review and authorize a limited screening of publicly available social media content.

The whole process takes about 5 minutes:

  1. Read the disclosure describing exactly what is (and isn't) reviewed
  2. Sign the authorization electronically
  3. Optionally list your social media accounts so we review the right person

Start here: ${opts.link}

Nothing is reviewed until you authorize it. You will never be asked for passwords or private account access.

If you have questions or believe you received this in error, just reply to this email.

All-Star Talent`,
  }
}

export function consentCopyEmail(opts: {
  candidateName: string
  signedAt: string
  disclosureVersion: string
}) {
  return {
    subject: 'Your signed screening authorization (copy for your records)',
    text: `Hi ${opts.candidateName},

This confirms you completed the screening disclosure and authorization on ${opts.signedAt} (document version ${opts.disclosureVersion}).

Keep this email for your records. You have the right to request a copy of any report prepared about you, and to dispute inaccurate or incomplete information. Reply to this email to make either request.

All-Star Talent`,
  }
}

export function consentDoneAdminEmail(opts: {
  candidateName: string
  clientName: string
  orderId: number
  profileCount: number
}) {
  return {
    subject: `Consent completed: ${opts.candidateName} (${opts.clientName})`,
    text: `${opts.candidateName} completed the disclosure and authorization for ${opts.clientName}.

They provided ${opts.profileCount} social media profile link${opts.profileCount === 1 ? '' : 's'}.

Order: ${appUrl()}/admin/orders/${opts.orderId}`,
  }
}

export function reportDeliveryEmail(opts: {
  clientName: string
  candidateName: string
  link: string
}) {
  return {
    subject: `Screening report ready: ${opts.candidateName}`,
    text: `The social media screening report for ${opts.candidateName} is ready.

View / download (keep this link confidential): ${opts.link}

REMINDER — before taking any adverse action based on this report, federal law requires that the candidate first receive a copy of the report and a summary of their FCRA rights, with a reasonable waiting period before a final decision. The screening portal can send both notices for you.

All-Star Talent`,
  }
}

export function disputeAckEmail(opts: { candidateName: string }) {
  return {
    subject: 'We received your dispute',
    text: `Hi ${opts.candidateName},

We've received your dispute regarding your screening report and have opened a reinvestigation. We will review the disputed information free of charge and respond with the results, generally within 30 days.

All-Star Talent`,
  }
}

export function disputeResolvedEmail(opts: {
  candidateName: string
  resolution: string
}) {
  return {
    subject: 'Your dispute has been resolved',
    text: `Hi ${opts.candidateName},

Our reinvestigation of your dispute is complete. Result:

${opts.resolution}

If the report was corrected, an updated copy is available via your original report link. If you disagree with the outcome, you may add a brief statement of dispute to your file by replying to this email.

All-Star Talent`,
  }
}
