import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { BABSON_EMAIL, HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { validGradYear } from '@/lib/terms'

export const runtime = 'nodejs'

// Step 1 of "add my school email": the guest tells us who they are, we remember it, and the app then asks Firebase to
// send a confirmation link to the school address. When they confirm and sign in with it, /api/guest/status finishes the upgrade.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if ((await accessOf(t)).level !== 'guest') throw new HttpError(400, 'Your account already has a school email.')
    const b = await readJson(req)
    const email = str(b.email, 200).toLowerCase()
    const firstName = str(b.firstName, 40), lastName = str(b.lastName, 60), gradYear = str(b.gradYear, 10)
    if (!BABSON_EMAIL.test(email)) throw new HttpError(400, 'Use your Babson, Olin or Wellesley email.')
    if (!firstName || !lastName) throw new HttpError(400, 'Enter your first and last name.')
    if (!validGradYear(gradYear)) throw new HttpError(400, 'Pick your graduation year.')
    try {
      await adminAuth().getUserByEmail(email)
      throw new HttpError(409, 'That school email already has an account. Sign in with it instead.')
    } catch (e) {
      if (e instanceof HttpError) throw e
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e
    }
    await adminDb().collection('users').doc(t.uid).set(
      { pendingSchool: { email, firstName, lastName, gradYear } }, { merge: true })
    return { ok: true }
  })
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    await adminDb().collection('users').doc(t.uid).update({ pendingSchool: FieldValue.delete() }).catch(() => {})
    return { ok: true }
  })
}
