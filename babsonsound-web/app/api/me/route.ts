import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, isBabsonToken, isDeveloperToken, readJson, requireUser, str } from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const u = await adminDb().collection('users').doc(t.uid).get()
    if (!u.exists) throw new HttpError(404, 'Profile not found.')
    return {
      uid: t.uid,
      firstName: u.get('firstName') ?? u.get('displayName') ?? '',
      email: u.get('email') ?? t.email ?? '',
      phoneNumber: u.get('phoneNumber') ?? '',
      role: u.get('role') ?? 'listener',
      isDeveloper: isDeveloperToken(t),
      isBabson: isBabsonToken(t),
    }
  })
}

// Edit your own first name.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const firstName = str((await readJson(req)).firstName, 40)
    if (!firstName) throw new HttpError(400, 'Enter a first name.')
    await adminDb().collection('users').doc(t.uid).update({ firstName, displayName: firstName })
    return { ok: true }
  })
}
