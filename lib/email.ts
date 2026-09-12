import nodemailer from 'nodemailer'

// SMTP via env vars. If SMTP isn't configured yet, we log the email to the
// console instead of sending, so the whole app works before email is set up.
//
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//
// (Resend, Mailgun, SES, and Gmail app passwords all work — any SMTP creds.)

function transporterOrNull() {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
}

export async function sendMail(opts: {
  to: string
  subject: string
  text: string
}) {
  const t = transporterOrNull()
  const from = process.env.MAIL_FROM || 'screening@example.com'
  if (!t) {
    console.log(
      `\n=== EMAIL (SMTP not configured; logging instead) ===\nTo: ${opts.to}\nFrom: ${from}\nSubject: ${opts.subject}\n\n${opts.text}\n=== END EMAIL ===\n`
    )
    return
  }
  try {
    await t.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text })
  } catch (err) {
    console.error('Email send failed:', err)
  }
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
