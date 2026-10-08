import { after } from 'next/server'
import { notifyAdmins } from '@/lib/server/push'
import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { PUBLIC_ACCESS } from '@/lib/access'
import { ANY_EMAIL, BABSON_EMAIL, HttpError, handle, readJson, str } from '@/lib/server/http'
import { indexKeyFromE164 } from '@/lib/server/phone'
import { normalizeUS } from '@/lib/phone'
import { prelaunchOn } from '@/lib/prelaunch'
import { VERIFY_GRACE_MS } from '@/lib/verify-grace'
import { TERMS_VERSION, validGradYear } from '@/lib/terms'
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

    const gradYear = str(b.gradYear, 10)

    if (b.agreed !== true) throw new HttpError(400, 'Agree to the Terms of Use and Privacy Policy to create an account.')
    if (!validGradYear(gradYear)) throw new HttpError(400, 'Pick your graduation year.')
    if (!firstName) throw new HttpError(400, 'Enter your first name.')
    if (!lastName) throw new HttpError(400, 'Enter your last name.')
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.')
    const school = BABSON_EMAIL.test(email)
    const tester = await isTester(email)
    // Other domains can only sign up here if the station added them as a beta tester (or the site is in public mode).
    const open = PUBLIC_ACCESS && !school && !tester
    // Anyone else can still make an account, but it waits for the station to approve them as a beta tester.
    const pending = !school && !tester && !open
    if (prelaunchOn() && !tester && !pending) {
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
      await adminAuth().setCustomUserClaims(uid, { graceUntil: Date.now() + VERIFY_GRACE_MS, ...(tester ? { tester: true } : {}), ...(open ? { openMember: true } : {}) })
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
          firstName, lastName, username, displayName: firstName, email, phoneNumber: phone, gradYear,
          termsAcceptedAt: Timestamp.now(), termsVersion: TERMS_VERSION,
          role: 'listener', accountType: pending ? 'pending' : 'babson',
          ...(pending ? { betaStatus: 'pending' } : {}),
          ...(tester ? { betaTester: true } : {}),
          ...(open ? { openMember: true } : {}),
          hostOfShows: [], notifyNewEpisode: [], notifyGoesLive: [],
          joinedAt: Timestamp.now(),
        })
      })
    } catch (e) {
      await adminAuth().deleteUser(uid).catch(() => {})
      throw e
    }
    if (pending) after(() => notifyAdmins('testers', { title: 'Tester waiting for approval', body: email }))
    return { ok: true }
  })
}
