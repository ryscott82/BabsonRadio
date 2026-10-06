import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireBabson, str } from '@/lib/server/http'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireBabson(req)
    const guestUid = str((await readJson(req)).guestUid, 128)
    if (!guestUid) throw new HttpError(400, 'Invalid request.')
    const db = adminDb()
    const ref = db.collection('guestPasses').doc(guestUid)
    const pass = await ref.get()
    if (!pass.exists) throw new HttpError(404, 'Pass not found.')
    const caller = await db.collection('users').doc(t.uid).get()
    if (pass.get('sponsorUid') !== t.uid && caller.get('role') !== 'superAdmin') {
      throw new HttpError(403, 'Only the sponsoring student can revoke this pass.')
    }
    await ref.update({ revoked: true, revokedAt: Timestamp.now() })
    return { ok: true }
  })
}
