import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, BABSON_EMAIL, HttpError, handle, readJson, str } from '@/lib/server/http'
import { phoneFields } from '@/lib/server/phoneStore'
import { normalizeUS } from '@/lib/phone'
import { VERIFY_GRACE_MS } from '@/lib/verify-grace'
import { TERMS_VERSION, validGradYear } from '@/lib/terms'
import { signupGuard } from '@/lib/server/signupGuard'
import { applyInviteNow } from '@/lib/server/access'
import { assertCleanName } from '@/lib/server/wordFilter'
import { nameLower } from '@/lib/studioBookCore'

export const runtime = 'nodejs'

// Creates an account (student for a school email, otherwise guest). Email verification is sent by the client afterwards; members must verify
// within 7 days (Firestore rules and the server accept the `graceUntil` claim until then).
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req)
    const firstName = str(b.firstName, 40)
    const lastName = str(b.lastName, 60)
    const email = str(b.email, 200).toLowerCase()
    const password = typeof b.password === 'string' ? b.password : ''
    const rawPhone = str(b.phone, 30)
    const phone = normalizeUS(rawPhone)

    const gradYear = str(b.gradYear, 10)

    if (b.agreed !== true) throw new HttpError(400, 'Agree to the Terms of Use and Privacy Policy to create an account.')
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.')
    const school = BABSON_EMAIL.test(email)
    if (gradYear && !validGradYear(gradYear)) throw new HttpError(400, 'Pick a valid graduation year.')
    // Anyone can sign up. A verified school email makes them a student; any other email is a guest (live radio only).
    // Name, phone and graduation year are optional here; "About you" asks for them later.
    if (rawPhone && !phone) throw new HttpError(400, 'Enter a valid 10-digit US phone number, or leave it blank.')
    if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be 8–128 characters.')
    await assertCleanName(adminDb(), firstName, lastName)

    // Strict limits with a CAPTCHA only when something looks off (lib/signupLimits.ts). Counts this attempt.
    const guard = await signupGuard(req, email, b.captchaToken)
    try {
      // The Babson username (part before @babson.edu) is the account's username. Email is unique, so it is too.
      // Olin and Wellesley usernames get a suffix so they can't collide with a Babson one.
      const at = email.indexOf('@')
      const domainName = email.slice(at + 1, email.indexOf('.', at))
      const username = domainName === 'babson' ? email.slice(0, at) : `${email.slice(0, at)}-${domainName}`
      const db = adminDb()
      // Phone numbers are for students only: a Guest's number is not kept. Stored as phoneEncrypted + phoneHash + phoneVerified=false.
      const pf = phone && school ? await phoneFields(phone) : null
      const phoneRef = pf ? db.collection('phoneIndex').doc(pf.phoneHash) : null

      let uid: string
      try {
        uid = (await adminAuth().createUser({ email, password, displayName: firstName || undefined, emailVerified: false })).uid
        // 7 days of full use before email verification is required (rules and the server check this claim).
        await adminAuth().setCustomUserClaims(uid, { graceUntil: Date.now() + VERIFY_GRACE_MS })
      } catch (e) {
        const code = (e as { code?: string }).code
        if (code === 'auth/email-already-exists') throw new HttpError(409, 'An account with that email already exists. Try signing in.')
        if (code === 'auth/invalid-password') throw new HttpError(400, 'Password is too weak.')
        throw e
      }

      try {
        await db.runTransaction(async tx => {
          // A number someone else already uses is allowed: the lookup entry stays with the first account.
          if (phoneRef && !(await tx.get(phoneRef)).exists) tx.set(phoneRef, { uid, verified: false })
          tx.set(db.collection('users').doc(uid), {
            firstName, lastName, nameLower: nameLower(firstName, lastName), username, displayName: firstName || email.split('@')[0], email, ...(pf ?? {}), gradYear: school ? gradYear : '',
            termsAcceptedAt: Timestamp.now(), termsVersion: TERMS_VERSION,
            // The sign-up form says "We'll email you when we launch." The launch email only goes to accounts with this.
            ...(b.launchNotice === false ? {} : { launchNoticeConsentAt: Timestamp.now() }),
            level: school ? 'student' : 'guest', accountType: school ? 'babson' : 'guest',
            studioTrained: false, radioTrained: false,
            notifyNewEpisode: [], notifyGoesLive: [],
            joinedAt: Timestamp.now(),
          })
        })
      } catch (e) {
        await adminAuth().deleteUser(uid).catch(() => {})
        throw e
      }
      // A role saved for this email by an admin attaches now; it gives nothing until the email is verified.
      await applyInviteNow(uid, email).catch(e => console.error('[invite]', e))
    } catch (e) {
      await guard.fail()
      throw e
    }
    return { ok: true }
  })
}
