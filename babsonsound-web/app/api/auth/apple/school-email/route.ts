import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, HttpError, handle, isDeveloperToken, readJson, requireUser, str } from '@/lib/server/http'
import { isTester } from '@/lib/server/testers'
import { VERIFY_GRACE_MS } from '@/lib/verify-grace'
import { TERMS_VERSION } from '@/lib/terms'

export const runtime = 'nodejs'

// "Sign in with Apple" accounts must still belong to a Babson, Olin or Wellesley student. They give their school email
// here; it becomes the account's email (unverified), they get 7 days of full use, and the app then sends the
// verification link to it. Everything else (rules, server checks, roles) already works from the account's email.
// They can send a different school email again until it is verified (a typo fix); the 7 days never restart.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if (isDeveloperToken(t)) throw new HttpError(400, 'Developer accounts do not need a school email.')
    const b = await readJson(req)
    const email = str(b.email, 200).toLowerCase()
    if (b.agreed !== true) throw new HttpError(400, 'Agree to the Terms of Use and Privacy Policy to create an account.', 'BR-ACC-019')
    if (!BABSON_EMAIL.test(email)) throw new HttpError(400, 'Use your Babson, Olin or Wellesley email.', 'BR-ACC-001')

    const auth = adminAuth()
    const rec = await auth.getUser(t.uid)
    if (!rec.providerData.some(p => p.providerId === 'apple.com')) {
      throw new HttpError(403, 'This step is only for accounts that signed in with Apple.', 'BR-APL-001')
    }
    if (rec.emailVerified && rec.email && BABSON_EMAIL.test(rec.email.toLowerCase())) {
      throw new HttpError(400, 'Your account already has a verified school email.')
    }
    const tester = await isTester(email)

    try {
      await auth.updateUser(t.uid, { email, emailVerified: false })
    } catch (e) {
      if ((e as { code?: string }).code === 'auth/email-already-exists') {
        throw new HttpError(409, 'An account with that email already exists. Sign in with it instead.', 'BR-ACC-002')
      }
      throw e
    }
    const claims = (rec.customClaims ?? {}) as Record<string, unknown>
    await auth.setCustomUserClaims(t.uid, {
      ...claims,
      graceUntil: typeof claims.graceUntil === 'number' ? claims.graceUntil : Date.now() + VERIFY_GRACE_MS,
      ...(tester ? { tester: true } : {}),
    })

    // Same username rule as email sign-up: the part before the @ (Olin and Wellesley get a suffix).
    const at = email.indexOf('@')
    const domainName = email.slice(at + 1, email.indexOf('.', at))
    const username = domainName === 'babson' ? email.slice(0, at) : `${email.slice(0, at)}-${domainName}`
    const ref = adminDb().collection('users').doc(t.uid)
    const exists = (await ref.get()).exists
    const first = str(b.firstName, 40), last = str(b.lastName, 60)
    await ref.set({
      email, username, role: 'listener', accountType: 'babson', signInProvider: 'apple',
      termsAcceptedAt: Timestamp.now(), termsVersion: TERMS_VERSION,
      ...(first ? { firstName: first, displayName: first } : {}),
      ...(last ? { lastName: last } : {}),
      ...(tester ? { betaTester: true } : {}),
      ...(exists ? {} : { hostOfShows: [], notifyNewEpisode: [], notifyGoesLive: [], joinedAt: Timestamp.now() }),
    }, { merge: true })
    return { ok: true }
  })
}
