import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'

export const runtime = 'nodejs'

// Staff keep a pending request from approving itself (or let it go again). A held request waits for a person to approve or decline it.
//   POST { requestId, hold: boolean, note? }   -> { ok, held }
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const requestId = str(b.requestId, 100)
    const note = str(b.note, 300)
    if (!requestId || typeof b.hold !== 'boolean') throw new HttpError(400, 'Invalid request.')
    const ref = adminDb().collection('slotRequests').doc(requestId)
    await adminDb().runTransaction(async tx => {
      const r = await tx.get(ref)
      if (!r.exists) throw new HttpError(404, 'Request not found.')
      if (r.get('status') !== 'pending') throw new HttpError(409, 'This request was already handled.')
      tx.update(ref, b.hold
        ? { held: true, heldNote: note, heldBy: t.uid, heldAt: Timestamp.now() }
        : { held: FieldValue.delete(), heldNote: FieldValue.delete(), heldBy: FieldValue.delete(), heldAt: FieldValue.delete(), autoBlockedReason: FieldValue.delete(), autoCheckedAt: FieldValue.delete() })
    })
    return { ok: true, held: b.hold }
  })
}
