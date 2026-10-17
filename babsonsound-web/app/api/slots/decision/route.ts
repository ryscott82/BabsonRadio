import { CONDUCT_VERSION } from '@/lib/conduct'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { findConflict } from '@/lib/server/slots'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'
import { deleteImage } from '@/lib/server/images'
import { after } from 'next/server'
import { sendMail, slotDecisionMail } from '@/lib/server/mailer'

export const runtime = 'nodejs'

// Staff approve or decline. Approving books the time on the public schedule (airSlots).
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

    const result = await db.runTransaction(async tx => {
      const r = await tx.get(reqRef)
      if (!r.exists) throw new HttpError(404, 'Request not found.')
      if (r.get('status') !== 'pending') throw new HttpError(409, 'This request was already handled.')

      if (action === 'decline') {
        tx.update(reqRef, { status: 'declined', staffNote: note, decidedAt: Timestamp.now(), decidedBy: t.uid })
        return { ok: true, declinedImage: r.get('imagePath') as string | undefined, mail: { to: String(r.get('requesterEmail') ?? ''), title: String(r.get('title') ?? ''), at: r.get('startAt').toMillis() as number } }
      }

      const signer = await tx.get(db.collection('users').doc(String(r.get('requesterUid'))))
      if (signer.get('conductVersion') !== CONDUCT_VERSION) throw new HttpError(409, 'They have not signed the on-air agreement yet.')

      const start: Timestamp = r.get('startAt')
      const end: Timestamp = r.get('endAt')
      if (start.toMillis() < Date.now()) throw new HttpError(400, 'That time has already passed.')
      if (await findConflict(db, start.toDate(), end.toDate(), tx)) {
        throw new HttpError(409, 'That time is now taken by another approved slot.')
      }

      tx.set(db.collection('airSlots').doc(requestId), {
        requestId, requesterUid: r.get('requesterUid'), hostName: r.get('requesterName'),
        title: r.get('title'), type: r.get('type'), category: r.get('category'),
        description: r.get('description') ?? '', imageUrl: r.get('imageUrl') ?? '', imagePath: r.get('imagePath') ?? '',
        startAt: start, endAt: end,
        receiveRatings: r.get('receiveRatings') !== false,
        makePublic: r.get('makePublic') === true, publicConsentId: r.get('publicConsentId') ?? '',
      })
      tx.update(reqRef, {
        status: 'approved', staffNote: note, connectionInfo,
        decidedAt: Timestamp.now(), decidedBy: t.uid,
      })
      return { ok: true, mail: { to: String(r.get('requesterEmail') ?? ''), title: String(r.get('title') ?? ''), at: start.toMillis() } }
    })
    // Email the student the answer (does nothing until RESEND_API_KEY is set in Vercel).
    const m = result.mail
    if (m?.to) {
      const when = new Date(m.at).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
      const mail = slotDecisionMail({ approved: action === 'approve', title: m.title, when, note, connectionInfo })
      after(() => sendMail(m.to, mail.subject, mail.text, mail.html))
    }
    // Refit the auto-scheduled filler around the new booking. Never blocks the approval.
    if ('declinedImage' in result) await deleteImage(result.declinedImage) // a declined request's picture is no longer needed
    if (action === 'approve') await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e))
    return result
  })
}
