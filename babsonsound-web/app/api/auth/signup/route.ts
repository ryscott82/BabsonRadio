import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, BABSON_EMAIL, HttpError, handle, readJson, str } from '@/lib/server/http'
import { indexKeyFromE164 } from '@/lib/server/phone'
import { normalizeUS } from '@/lib/phone'
import { prelaunchOn } from '@/lib/prelaunch'
import { VERIFY_GRACE_MS } from '@/lib/verify-grace'
import { isTester } from '@/lib/server/testers'

export const runtime = 'nodejs'

// Creates a student account. Email verification is sent by the client afterwards; members must verify
// within 3 days (Firestore rules and the server accept the `graceUntil` claim until then).
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req)
    const firstName = str(b.firstName, 40)
    const lastName = str(b.lastName, 60)
    const email = str(b.email, 200).toLowerCase()
    const password = typeof b.password === 'string' ? b.password : ''
    const phone = normalizeUS(str(b.phone, 30))

    if (!firstName) throw new HttpError(400, 'Enter your first name.')
    if (!lastName) throw new HttpError(400, 'Enter your last name.')
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.')
    const school = BABSON_EMAIL.test(email)
    const tester = await isTester(email)
    // Other domains can only sign up here if the station added them as a beta tester.
    if (!school && !tester) throw new HttpError(400, 'Use your @babson.edu, @olin.edu or @wellesley.edu email address.')
    if (prelaunchOn() && !tester) {
      throw new HttpError(403, 'Babson Radio is invite-only until launch. Ask the station to add your email.', 'BR-PRE-002')
    }
    if (!phone) throw new HttpError(400, 'Enter a valid 10-digit US phone number.')
    if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be 8–128 characters.')

    // The Babson username (part before @babson.edu) is the account's username. Email is unique, so it is too.
    // Olin and Wellesley usernames get a suffix so they can't collide with a Babson one.
    const at = email.indexOf('@')
    const domainName = email.slice(at + 1, email.indexOf('.', at))
    const username = domainName === 'babson' ? email.slice(0, at) : `${email.slice(0, at)}-${domainName}`
    const db = adminDb()
    const phoneRef = db.collection('phoneIndex').doc(await indexKeyFromE164(phone))
    if ((await phoneRef.get()).exists) throw new HttpError(409, 'That phone number is already registered.')

    let uid: string
    try {
      uid = (await adminAuth().createUser({ email, password, displayName: firstName, emailVerified: false })).uid
      // 3 days of full use before the email link is required (rules and the server check this claim).
      await adminAuth().setCustomUserClaims(uid, { graceUntil: Date.now() + VERIFY_GRACE_MS, ...(tester ? { tester: true } : {}) })
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'auth/email-already-exists') throw new HttpError(409, 'An account with that email already exists. Try signing in.')
      if (code === 'auth/invalid-password') throw new HttpError(400, 'Password is too weak.')
      throw e
    }

    try {
      await db.runTransaction(async tx => {
        if ((await tx.get(phoneRef)).exists) throw new HttpError(409, 'That phone number is already registered.')
        tx.set(phoneRef, { uid })
        tx.set(db.collection('users').doc(uid), {
          firstName, lastName, username, displayName: firstName, email, phoneNumber: phone,
          role: 'listener', accountType: 'babson',
          ...(tester ? { betaTester: true } : {}),
          hostOfShows: [], notifyNewEpisode: [], notifyGoesLive: [],
          joinedAt: Timestamp.now(),
        })
      })
    } catch (e) {
      await adminAuth().deleteUser(uid).catch(() => {})
      throw e
    }
    return { ok: true }
  })
}
