import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { mailFrom, mailMethod, sendMail } from '@/lib/email'

// Admin-only: send a test email so email setup can be verified in one click.
export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const to = String(body.to || user.email).trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }
  const method = mailMethod()
  const result = await sendMail({
    to,
    subject: 'All-Star Screening: test email',
    text: `This is a test email from the All-Star Screening Portal.\n\nIf you're reading this, email is working.\n\nSent from: ${mailFrom()}\nMethod: ${method === 'microsoft' ? 'Microsoft 365' : method === 'smtp' ? 'SMTP' : 'not configured'}`,
  })
  await audit(user.email, 'email.test', null, { to, ok: result.ok, method })
  if (method === 'log') {
    return NextResponse.json(
      { error: 'Email is not set up yet, so the test was written to the Render log instead of being sent. Add the Microsoft 365 settings in Render first.' },
      { status: 400 }
    )
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, to })
}
