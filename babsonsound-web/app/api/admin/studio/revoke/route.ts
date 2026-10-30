import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { refreshBadge, studioActor } from '@/lib/server/studio'

export const runtime = 'nodejs'

// Directors and admins. { grantId, reason } — the reason is typed by the admin and must be at least 10 characters.
// The grant is never deleted or edited: only the revoke fields are set. The person's badge is recalculated from what is left.
export async function POST(req: Request) {
  return handle(async () => {
    const { t } = await studioActor(req, 'staff')
    const b = await readJson(req)
    const grantId = str(b.grantId, 200), reason = str(b.reason, 500)
    if (!grantId) throw new HttpError(400, 'Pick a grant to revoke.')
    if (reason.length < 10) throw new HttpError(400, 'Type a reason of at least 10 characters.', 'BR-STU-019')
    const db = adminDb()
    const ref = db.collection('trainingGrants').doc(grantId)
    const { uid, badge } = await db.runTransaction(async tx => {
      const d = await tx.get(ref)
      if (!d.exists) throw new HttpError(404, 'That grant was not found.', 'BR-STU-020')
      if (d.get('revokedAt') != null) throw new HttpError(409, 'That grant is already revoked.', 'BR-STU-020')
      tx.update(ref, { revokedAt: Timestamp.now(), revokedBy: t.uid, revokeReason: reason })
      return { uid: String(d.get('uid')), badge: d.get('badge') as 'studio' | 'radio' }
    })
    await refreshBadge(db, uid, badge, Date.now())
    return { ok: true }
  })
}
