import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { normalizeCategories } from '@/lib/categories'
import { newConsentToken } from '@/lib/tokens'
import { appUrl, consentInviteEmail, sendMail } from '@/lib/email'

export async function GET() {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const orders = await sql`
    SELECT o.*, c.name AS client_name, u.full_name AS created_by_name
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    LEFT JOIN users u ON u.id = o.created_by
    ORDER BY o.created_at DESC
  `
  return NextResponse.json({ orders })
}

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const { client_id, candidate_name, candidate_email, candidate_location, job_title, lookback_years, categories, send_now } = body
  const opt = (v: any) => (String(v ?? '').trim().slice(0, 200) || null)
  if (!client_id || !candidate_name || !candidate_email) {
    return NextResponse.json(
      { error: 'Client, candidate name, and candidate email are required' },
      { status: 400 }
    )
  }
  const clientRows = (await sql`SELECT id, name FROM clients WHERE id = ${client_id}`) as any[]
  if (!clientRows[0]) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }
  const cats = JSON.stringify(normalizeCategories(categories))
  const token = newConsentToken()
  const lookback = Math.min(Math.max(Number(lookback_years) || 7, 1), 10)
  const status = send_now ? 'consent_sent' : 'draft'
  const rows = (await sql`
    INSERT INTO orders
      (client_id, candidate_name, candidate_email, candidate_location, job_title,
       lookback_years, categories, status, consent_token, consent_sent_at, created_by,
       candidate_phone, candidate_company, candidate_high_school, candidate_college)
    VALUES
      (${client_id}, ${candidate_name}, ${candidate_email}, ${candidate_location || null},
       ${job_title || null}, ${lookback}, ${cats}, ${status}, ${token},
       ${send_now ? new Date().toISOString() : null}, ${user.id},
       ${opt(body.candidate_phone)}, ${opt(body.candidate_company)},
       ${opt(body.candidate_high_school)}, ${opt(body.candidate_college)})
    RETURNING id
  `) as { id: number }[]
  const orderId = rows[0].id
  await audit(user.email, 'order.created', orderId, {
    client_id, candidate_email, send_now: !!send_now,
  })
  let emailError: string | null = null
  if (send_now) {
    const link = `${appUrl()}/consent/${token}`
    const mail = consentInviteEmail({
      candidateName: candidate_name,
      clientName: clientRows[0].name,
      link,
    })
    const sent = await sendMail({ to: candidate_email, ...mail })
    if (sent.method === 'log') {
      emailError = 'Email is not set up yet, so nothing was sent.'
      await audit(user.email, 'consent.invite_not_sent', orderId, { reason: 'email not configured' })
    } else if (sent.ok) {
      await audit(user.email, 'consent.invite_sent', orderId)
    } else {
      emailError = sent.error || 'unknown error'
      await audit(user.email, 'consent.invite_failed', orderId, { error: emailError })
    }
  }
  return NextResponse.json({ id: orderId, email_error: emailError })
}
