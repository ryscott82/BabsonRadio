import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { after } from 'next/server'
import { notifyAdmins } from '@/lib/server/push'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'
import { releaseImage } from '@/lib/server/slots'
import { releaseRecording } from '@/lib/server/recordings'
import { flagStrike } from '@/lib/server/strikes'
import { loadStudioRules } from '@/lib/server/studioRules'
import { isLateCancel } from '@/lib/strikesCore'

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
      return { ok: true, imagePath: r.get('imagePath') as string | undefined, title: String(r.get('title') ?? 'A show'), was: String(status), startAt: r.get('startAt').toMillis() as number, type: String(r.get('type')) }
    })
    after(() => notifyAdmins('cancellations', { title: result.was === 'approved' ? 'Approved show cancelled' : 'Show request cancelled', body: `${result.title}${reason ? `: ${reason}` : ''}` }, t.uid))
    await releaseRecording(db, requestId).catch(e => console.error('[recording release]', e))
    // An approved show cancelled less than the hours in Settings (default 24) before it starts is flagged for the E-board to review. Never a strike by itself.
    if (result.was === 'approved') {
      const hours = (await loadStudioRules(db)).lateCancelHours
      if (isLateCancel(result.startAt, Date.now(), hours)) await flagStrike(db, { uid: t.uid, kind: 'late-cancel', refId: requestId, title: result.title, at: result.startAt, note: `Cancelled less than ${hours} hours before the start.` }).catch(e => console.error('[strike flag]', e))
    }
    await releaseImage(db, result.imagePath, requestId) // not while a repeat of the same show still uses the picture
    // A freed slot gets filler again.
    await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e))
    return result
  })
}
