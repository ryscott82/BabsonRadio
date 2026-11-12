import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { after } from 'next/server'
import { notifyAdmins } from '@/lib/server/push'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'
import { releaseImage } from '@/lib/server/slots'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const body = await readJson(req)
    const requestId = str(body.requestId, 100)
    const reason = str(body.reason, 300) // optional, shown to staff
    if (!requestId) throw new HttpError(400, 'Invalid request.')
    const db = adminDb()
    const ref = db.collection('slotRequests').doc(requestId)
    const result = await db.runTransaction(async tx => {
      const r = await tx.get(ref)
      if (!r.exists || r.get('requesterUid') !== t.uid) throw new HttpError(404, 'Request not found.')
      const status = r.get('status')
      if (status !== 'pending' && status !== 'approved') throw new HttpError(409, 'This request can no longer be cancelled.')
      if (r.get('startAt').toMillis() < Date.now()) throw new HttpError(400, 'That slot has already started.')
      tx.update(ref, { status: 'cancelled', cancelledAt: Timestamp.now(), cancelReason: reason, cancelledFrom: status, autoApproveAt: FieldValue.delete(), autoBlockedReason: FieldValue.delete(), autoCheckedAt: FieldValue.delete() })
      if (status === 'approved') tx.delete(db.collection('airSlots').doc(requestId))
      return { ok: true, imagePath: r.get('imagePath') as string | undefined, title: String(r.get('title') ?? 'A show'), was: String(status) }
    })
    after(() => notifyAdmins('cancellations', { title: result.was === 'approved' ? 'Approved show cancelled' : 'Show request cancelled', body: `${result.title}${reason ? `: ${reason}` : ''}` }, t.uid))
    await releaseImage(db, result.imagePath, requestId) // not while a repeat of the same show still uses the picture
    // A freed slot gets filler again.
    await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e))
    return result
  })
}
