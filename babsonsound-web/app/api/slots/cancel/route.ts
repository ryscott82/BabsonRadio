import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'
import { deleteImage } from '@/lib/server/images'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const requestId = str((await readJson(req)).requestId, 100)
    if (!requestId) throw new HttpError(400, 'Invalid request.')
    const db = adminDb()
    const ref = db.collection('slotRequests').doc(requestId)
    const result = await db.runTransaction(async tx => {
      const r = await tx.get(ref)
      if (!r.exists || r.get('requesterUid') !== t.uid) throw new HttpError(404, 'Request not found.')
      const status = r.get('status')
      if (status !== 'pending' && status !== 'approved') throw new HttpError(409, 'This request can no longer be cancelled.')
      if (r.get('startAt').toMillis() < Date.now()) throw new HttpError(400, 'That slot has already started.')
      tx.update(ref, { status: 'cancelled', cancelledAt: Timestamp.now() })
      if (status === 'approved') tx.delete(db.collection('airSlots').doc(requestId))
      return { ok: true, imagePath: r.get('imagePath') as string | undefined }
    })
    await deleteImage(result.imagePath)
    // A freed slot gets filler again.
    await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e))
    return result
  })
}
