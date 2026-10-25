import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, HttpError, handle, readJson, str } from '@/lib/server/http'
import { mailConfigured, sendMail } from '@/lib/server/mailer'
import { SITE_URL } from '@/lib/links'

export const runtime = 'nodejs'

const COOLDOWN_MS = 45_000

// "Email me a sign-in link." No account needed first: tapping the link signs them in (and creates the account the first time).
//   POST { email }  ->  { ok: true }   (always the same answer, so it never reveals whether an address has an account)
// The email comes from babsonradio.com through Resend. One link per address every 45 seconds.
export async function POST(req: Request) {
  return handle(async () => {
    const email = str((await readJson(req)).email, 200).toLowerCase()
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.', 'BR-ACC-009')
    if (!mailConfigured()) throw new HttpError(503, 'Email sign-in is not set up yet.', 'BR-LCH-001')

    const ref = adminDb().collection('loginLinks').doc(createHash('sha256').update(email).digest('hex'))
    const last = ((await ref.get()).get('at') as Timestamp | undefined)?.toMillis() ?? 0
    if (Date.now() - last < COOLDOWN_MS) throw new HttpError(429, 'We just sent you a link. Check your inbox, or wait a minute to ask again.')
    await ref.set({ at: Timestamp.now() })

    const link = await adminAuth().generateSignInWithEmailLink(email, {
      url: `${SITE_URL}/auth/link?e=${encodeURIComponent(email)}`, handleCodeInApp: true,
    })
    const ok = await sendMail(
      email, 'Your Babson Radio sign-in link',
      `Tap to sign in to Babson Radio:\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
      `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">` +
      `<p>Tap to sign in to Babson Radio.</p>` +
      `<p style="margin:28px 0"><a href="${link}" style="background:#006644;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600">Sign in</a></p>` +
      `<p style="font-size:12px;color:#6b665c">If you didn't ask for this, ignore this email.</p></div>`)
    if (!ok) throw new HttpError(502, 'We could not send the email. Try again in a minute.', 'BR-LCH-002')
    return { ok: true }
  }, { 'Cache-Control': 'no-store' })
}
