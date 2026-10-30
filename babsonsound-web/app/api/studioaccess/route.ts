import { createHmac } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, BABSON_EMAIL, HttpError, handle, readJson, str } from '@/lib/server/http'
import { verifyTurnstile } from '@/lib/server/turnstile'
import { clientIp } from '@/lib/signupLimits'
import { applyInviteNow } from '@/lib/server/access'
import { SITE_URL } from '@/lib/links'
import { mailConfigured, sendMail, setPasswordMail } from '@/lib/server/mailer'
import { loadStudioForm } from '@/lib/server/studioForm'

export const runtime = 'nodejs'

// The Studio training form is behind an email step. The form's address (set in Admin > Studio form, or STUDIO_FORM_URL in Vercel; never in the page or its scripts) is
// handed out only in the answer to this POST, so the page itself never contains it. This keeps casual sharing down; it cannot stop
// someone who opens their browser's developer tools from copying the address, because the browser has to load it to show it.
//   POST { email, captchaToken? }  ->  { url, embed }   (embed: show it in the page; otherwise the page offers it in a new window)
const PER_IP_PER_DAY = 25
const DAY = 86_400_000

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req)
    const email = str(b.email, 254).toLowerCase()
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.', 'BR-STU-101')

    const { url, embed } = await loadStudioForm()
    if (!url) throw new HttpError(503, 'The training form is not available right now. Try again later.', 'BR-STU-102')

    const ip = clientIp(req.headers)
    if ((await verifyTurnstile(b.captchaToken, ip)) === false) throw new HttpError(403, 'Quick check needed. Complete it and try again.', 'BR-ACC-022')

    const db = adminDb()
    const now = Date.now()
    const ipKey = ip ? createHmac('sha256', process.env.PII_KEY ?? 'br-signup').update(ip).digest('hex').slice(0, 24) : ''
    if (ipKey) {
      const ref = db.collection('studioAccessIp').doc(`${ipKey}_${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}`)
      const n = ((await ref.get()).get('n') as number | undefined) ?? 0
      if (n >= PER_IP_PER_DAY) throw new HttpError(429, 'Too many tries. Try again tomorrow.', 'BR-STU-103')
      await ref.set({ n: n + 1, expireAt: Timestamp.fromMillis(now + 2 * DAY) })
    }
    // Staff can see who opened the form (admin only; clients cannot read this collection).
    await db.collection('studioAccess').add({ email, at: Timestamp.fromMillis(now), ...(ipKey ? { ipHash: ipKey } : {}), expireAt: Timestamp.fromMillis(now + 365 * DAY) })
    // The email also becomes a Babson Radio account with no password yet. They get an email with a link to set a password, which also proves the email is theirs. The form is shown either way, and the answer is the same whether or not an account already existed.
    await preRegister(email).catch(e => console.error('[studioaccess account]', e))
    return { url, embed }
  }, { 'Cache-Control': 'private, no-store' })
}

/** Creates the account (student for a school email, otherwise guest) unless one exists. No password, no Terms acceptance and no launch-email
 *  consent are recorded: those happen when the person signs in for the first time. `preRegistered` keeps the unverified-account clean-up away. */
async function preRegister(email: string) {
  const auth = adminAuth()
  let existing = null
  try { existing = await auth.getUserByEmail(email) } catch (e) { if ((e as { code?: string }).code !== 'auth/user-not-found') throw e }
  if (existing) {
    // A pre-registered account that has no password yet gets the link again (at most once a day). Real accounts are left alone and get no email.
    const ref = adminDb().collection('users').doc(existing.uid)
    const snap = await ref.get()
    const last = (snap.get('passwordMailAt') as number | undefined) ?? 0
    if (snap.get('preRegistered') === true && !existing.passwordHash && Date.now() - last > 86_400_000) {
      await ref.update({ passwordMailAt: Date.now() })
      await sendSetPassword(email)
    }
    return
  }
  const school = BABSON_EMAIL.test(email)
  const at = email.indexOf('@')
  const domainName = email.slice(at + 1, email.indexOf('.', at))
  const username = domainName === 'babson' ? email.slice(0, at) : `${email.slice(0, at)}-${domainName}`
  let uid: string
  try { uid = (await auth.createUser({ email, emailVerified: false })).uid } catch (e) { if ((e as { code?: string }).code === 'auth/email-already-exists') return; throw e }
  try {
    await adminDb().collection('users').doc(uid).set({
      firstName: '', lastName: '', username, displayName: email.slice(0, at), email, gradYear: '',
      level: school ? 'student' : 'guest', accountType: school ? 'babson' : 'guest',
      studioTrained: false, radioTrained: false, notifyNewEpisode: [], notifyGoesLive: [],
      preRegistered: true, preRegisteredFrom: 'studioaccess', passwordMailAt: Date.now(), joinedAt: Timestamp.now(),
    })
  } catch (e) { await auth.deleteUser(uid).catch(() => {}); throw e }
  await applyInviteNow(uid, email).catch(e => console.error('[invite]', e))
  await sendSetPassword(email)
}

/** Emails a "set your password" link. Opening it also confirms the email address is theirs. */
async function sendSetPassword(email: string) {
  if (!mailConfigured()) return
  const auth = adminAuth()
  let link: string
  try { link = await auth.generatePasswordResetLink(email, { url: `${SITE_URL}/auth` }) } catch { link = await auth.generatePasswordResetLink(email) }
  const m = setPasswordMail({ link })
  await sendMail(email, m.subject, m.text, m.html)
}
