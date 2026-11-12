import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'
import { releaseImage } from '@/lib/server/slots'
import { releaseRecording } from '@/lib/server/recordings'
import { approveRequest, whenText } from '@/lib/server/slotApproval'
import { after } from 'next/server'
import { sendMail, slotDecisionMail } from '@/lib/server/mailer'

export const runtime = 'nodejs'

// Staff approve or decline. Approving books the time on the public schedule (airSlots) through approveRequest, the same code the auto-approver runs.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const requestId = str(b.requestId, 100)
    const action = b.action
    const note = str(b.note, 500)
    const connectionInfo = str(b.connectionInfo, 1000) // e.g. live-stream login/instructions; shown only to the requester
    if (!requestId || (action !== 'approve' && action !== 'decline')) throw new HttpError(400, 'Invalid request.')

    const db = adminDb()
    const reqRef = db.collection('slotRequests').doc(requestId)

    let mail: { to: string; title: string; at: number }
    let declinedImage: string | undefined
    if (action === 'approve') {
      mail = (await approveRequest(db, requestId, { by: t.uid, note, connectionInfo })).mail
    } else {
      const r = await db.runTransaction(async tx => {
        const s = await tx.get(reqRef)
        if (!s.exists) throw new HttpError(404, 'Request not found.')
        if (s.get('status') !== 'pending') throw new HttpError(409, 'This request was already handled.')
        tx.update(reqRef, {
          status: 'declined', staffNote: note, decidedAt: Timestamp.now(), decidedBy: t.uid,
          autoApproveAt: FieldValue.delete(), autoBlockedReason: FieldValue.delete(), autoCheckedAt: FieldValue.delete(),
        })
        return s
      })
      declinedImage = r.get('imagePath') as string | undefined
      mail = { to: String(r.get('requesterEmail') ?? ''), title: String(r.get('title') ?? ''), at: r.get('startAt').toMillis() as number }
    }
    // Email the student the answer (does nothing until RESEND_API_KEY is set in Vercel).
    if (mail.to) {
      const m = slotDecisionMail({ approved: action === 'approve', title: mail.title, when: whenText(mail.at), note, connectionInfo })
      after(() => sendMail(mail.to, m.subject, m.text, m.html))
    }
    if (action === 'decline') await releaseRecording(db, requestId).catch(e => console.error('[recording release]', e))
    if (action === 'decline') await releaseImage(db, declinedImage, requestId) // a declined request's picture is no longer needed (unless a repeat still uses it)
    // Refit the auto-scheduled filler around the new booking. Never blocks the approval.
    if (action === 'approve') await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e))
    return action === 'decline' ? { ok: true, declinedImage, mail } : { ok: true, mail }
  })
}
