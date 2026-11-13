import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { recordingCaller } from '@/lib/server/boothRecordings'
import { cleanLiveShow, cleanRecordingId } from '@/lib/recordingsCore'
import { assertClean, censor } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// "Record a show" on the studio PC: { title, bookingId?, requestId?, cleanConfirmed?, id?, token? } -> { id }. Only the details are kept here; the PC
// uploads the file straight to AzuraCast with its own key (never through this site). Members with the Studio badge, or the studio PC on their behalf
// (signed headers + their control token, see recordingCaller). `id` is the PC's own id for the recording: sending it again returns the same record.
// requestId is the pre-recorded show it is for: it is attached when the upload is complete, if cleanConfirmed is true and the show still qualifies.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req)
    const raw = cleanLiveShow(b.live)
    // A live show archived by the PC after it ended: never refused for a word (the PC would retry forever), the words are starred out instead.
    const live = raw && { ...raw, hosts: raw.hosts.map(censor), description: censor(raw.description) }
    const who = await recordingCaller(req, b, Date.now(), !!live)
    const title = live ? censor(str(b.title, 80)) : str(b.title, 80)
    if (!title) throw new HttpError(400, 'Give the recording a title.')
    const db = adminDb()
    if (!live) await assertClean(db, title, '')
    const bookingId = live ? '' : str(b.bookingId, 100), requestId = live ? '' : str(b.requestId, 100)
    if (bookingId) {
      const bk = await db.collection('studioBookings').doc(bookingId).get()
      if (!bk.exists || bk.get('uid') !== who.uid) throw new HttpError(404, 'Booking not found.', 'BR-BKG-006')
    }
    if (requestId) {
      const rq = await db.collection('slotRequests').doc(requestId).get()
      if (!rq.exists || rq.get('requesterUid') !== who.uid || rq.get('type') !== 'prerecorded') throw new HttpError(404, 'Show not found.', 'BR-REC-003')
    }
    const doc = {
      uid: who.uid, title, ...(bookingId ? { bookingId } : {}), ...(requestId ? { forRequestId: requestId, cleanConfirmed: b.cleanConfirmed === true } : {}),
      ...(live ? { kind: 'live', live } : {}), azuracastPath: '', durationSec: 0, status: 'recording', createdAt: Timestamp.now(), ...(who.viaPc ? { fromStudioPc: true } : {}),
    }
    const pcId = cleanRecordingId(b.id)
    if (!pcId) return { id: (await db.collection('recordings').add(doc)).id }
    const ref = db.collection('recordings').doc(pcId)
    await db.runTransaction(async tx => {
      const d = await tx.get(ref)
      if (d.exists) { if (d.get('uid') !== who.uid) throw new HttpError(409, 'That recording id is taken.', 'BR-REC-001'); return }
      tx.create(ref, doc)
    })
    return { id: pcId }
  })
}
