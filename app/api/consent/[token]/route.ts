import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { audit } from '@/lib/audit'
import {
  DISCLOSURE_TEXT,
  AUTHORIZATION_TEXT,
  CALIFORNIA_NOTICE,
  DISCLOSURE_VERSION,
  FCRA_SUMMARY_OF_RIGHTS_URL,
  PROFILES_STEP_NOTE,
} from '@/lib/legal'
import {
  consentCopyEmail,
  consentDoneAdminEmail,
  sendMail,
} from '@/lib/email'
import { collectForOrder } from '@/lib/collect'
import { runAnalysis } from '@/lib/runAnalysis'
import { discoverForOrder } from '@/lib/discover'

// No auth here — the high-entropy token IS the credential. Everything is
// keyed strictly to the one order that owns the token.

async function findOrder(token: string) {
  const rows = (await sql`
    SELECT o.*, c.name AS client_name
    FROM orders o JOIN clients c ON c.id = o.client_id
    WHERE o.consent_token = ${token}
  `) as any[]
  return rows[0] ?? null
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const order = await findOrder(params.token)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!order.consent_viewed_at && !['cancelled'].includes(order.status)) {
    await sql`
      UPDATE orders SET consent_viewed_at = NOW(), updated_at = NOW()
      WHERE id = ${order.id}
    `
    await audit('candidate', 'consent.viewed', order.id)
  }

  return NextResponse.json({
    candidate_name: order.candidate_name,
    client_name: order.client_name,
    status: order.status,
    completed: !!order.consent_completed_at,
    cancelled: order.status === 'cancelled',
    legal: {
      version: DISCLOSURE_VERSION,
      disclosure: DISCLOSURE_TEXT,
      authorization: AUTHORIZATION_TEXT,
      california_notice: CALIFORNIA_NOTICE,
      fcra_rights_url: FCRA_SUMMARY_OF_RIGHTS_URL,
      profiles_note: PROFILES_STEP_NOTE,
    },
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const order = await findOrder(params.token)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'This screening was cancelled' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  const userAgent = req.headers.get('user-agent') || null

  if (body.step === 'sign') {
    if (order.consent_completed_at) {
      return NextResponse.json({ error: 'Already completed' }, { status: 400 })
    }
    const signature = String(body.signature_name || '').trim()
    if (signature.length < 3) {
      return NextResponse.json(
        { error: 'Please type your full legal name to sign' },
        { status: 400 }
      )
    }
    if (body.acknowledged !== true || body.authorized !== true) {
      return NextResponse.json(
        { error: 'Both acknowledgments are required' },
        { status: 400 }
      )
    }
    const state = body.state_of_residence ? String(body.state_of_residence) : null
    const wantsCopy = body.wants_copy === true
    await sql`
      INSERT INTO consents
        (order_id, disclosure_version, signature_name, state_of_residence,
         wants_copy, ip, user_agent)
      VALUES
        (${order.id}, ${DISCLOSURE_VERSION}, ${signature}, ${state},
         ${wantsCopy}, ${ip}, ${userAgent})
      ON CONFLICT (order_id) DO NOTHING
    `
    await audit('candidate', 'consent.signed', order.id, {
      disclosure_version: DISCLOSURE_VERSION,
      state_of_residence: state,
      wants_copy: wantsCopy,
    })
    return NextResponse.json({ ok: true })
  }

  if (body.step === 'profiles') {
    const consentRows = (await sql`
      SELECT id, signed_at FROM consents WHERE order_id = ${order.id}
    `) as any[]
    if (!consentRows[0]) {
      return NextResponse.json(
        { error: 'Please sign the authorization first' },
        { status: 400 }
      )
    }
    if (order.consent_completed_at) {
      return NextResponse.json({ error: 'Already completed' }, { status: 400 })
    }
    const profiles: { platform: string; url: string }[] = Array.isArray(body.profiles)
      ? body.profiles
      : []
    let saved = 0
    for (const p of profiles.slice(0, 20)) {
      const platform = String(p.platform || '').slice(0, 40)
      const url = String(p.url || '').trim().slice(0, 500)
      if (!platform || !/^https?:\/\//i.test(url)) continue
      await sql`
        INSERT INTO candidate_profiles (order_id, platform, url, added_by)
        VALUES (${order.id}, ${platform}, ${url}, 'candidate')
      `
      saved++
    }
    await sql`
      UPDATE orders SET status = 'consent_completed',
        consent_completed_at = NOW(), updated_at = NOW()
      WHERE id = ${order.id}
    `
    await audit('candidate', 'consent.completed', order.id, { profiles_provided: saved })

    // Copy of the consent to the candidate, for their records.
    const copy = consentCopyEmail({
      candidateName: order.candidate_name,
      signedAt: new Date(consentRows[0].signed_at).toLocaleString('en-US'),
      disclosureVersion: DISCLOSURE_VERSION,
    })
    await sendMail({ to: order.candidate_email, ...copy })

    // Heads-up to all staff.
    const admins = (await sql`SELECT email FROM users`) as { email: string }[]
    const notice = consentDoneAdminEmail({
      candidateName: order.candidate_name,
      clientName: order.client_name,
      orderId: order.id,
      profileCount: saved,
    })
    for (const a of admins) {
      await sendMail({ to: a.email, ...notice })
    }

    // Kick off automated collection + analysis in the background. The
    // candidate's response doesn't wait on it; failures are logged and the
    // analyst can re-run from the capture workspace.
    collectForOrder(order.id, 'system:auto')
      .then((results) => {
        const collected = results.reduce((a, r) => a + r.items, 0)
        if (collected > 0) return runAnalysis(order.id, 'system:auto')
      })
      .catch((err) => console.error(`Auto-collection failed for order ${order.id}:`, err))
      // Discovery runs regardless of what the candidate listed: it surfaces
      // additional PROBABLE profiles as suggestions awaiting human confirm.
      .then(() => discoverForOrder(order.id, 'system:auto'))
      .catch((err) => console.error(`Auto-discovery failed for order ${order.id}:`, err))

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown step' }, { status: 400 })
}
