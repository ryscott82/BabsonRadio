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
      invisible: u.get('invisible') === true,
    }
  })
}

// Edit your own first name and/or turn invisible mode on or off.
// Invisible: you don't show up in anyone's "tuned in" list and your likes aren't shown to friends.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    const update: Record<string, unknown> = {}
    if ('firstName' in b) {
      const firstName = str(b.firstName, 40)
      if (!firstName) throw new HttpError(400, 'Enter a first name.')
      update.firstName = firstName
      update.displayName = firstName
    }
    if (typeof b.invisible === 'boolean') update.invisible = b.invisible
    if (!Object.keys(update).length) throw new HttpError(400, 'Nothing to update.')
    await adminDb().collection('users').doc(t.uid).update(update)
    return { ok: true }
  })
}
