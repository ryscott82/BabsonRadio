import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, HttpError, handle, readJson, str } from '@/lib/server/http'
import { indexKeyFromE164 } from '@/lib/server/phone'
import { normalizeUS } from '@/lib/phone'

export const runtime = 'nodejs'

// Creates a Babson account. Email verification is sent by the client afterwards;
// Firestore rules refuse member access until the babson.edu address is verified.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req)
    const firstName = str(b.firstName, 40)
    const email = str(b.email, 200).toLowerCase()
    const password = typeof b.password === 'string' ? b.password : ''
    const phone = normalizeUS(str(b.phone, 30))

    if (!firstName) throw new HttpError(400, 'Enter your first name.')
    if (!BABSON_EMAIL.test(email)) throw new HttpError(400, 'Babson Radio requires a @babson.edu email address.')
    if (!phone) throw new HttpError(400, 'Enter a valid 10-digit US phone number.')
    if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be 8–128 characters.')

    const db = adminDb()
    const phoneRef = db.collection('phoneIndex').doc(await indexKeyFromE164(phone))
    if ((await phoneRef.get()).exists) throw new HttpError(409, 'That phone number is already registered.')

    let uid: string
    try {
      uid = (await adminAuth().createUser({ email, password, displayName: firstName, emailVerified: false })).uid
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
          firstName, displayName: firstName, email, phoneNumber: phone,
          role: 'listener', accountType: 'babson',
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
