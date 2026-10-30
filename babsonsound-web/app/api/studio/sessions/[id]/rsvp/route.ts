import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson } from '@/lib/server/http'
import { attendanceId, must, readSession, sessionsCol, studioActor } from '@/lib/server/studio'
import { effectiveStatus, verifiedGate } from '@/lib/studioRules'

export const runtime = 'nodejs'

// { rsvp?: boolean } — true (default) saves a spot, false gives it back. Capacity is checked here.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await studioActor(req)
    must(verifiedGate({ level: actor.a.level, emailVerified: actor.t.email_verified === true, demo: actor.a.demo }))
    const { id } = await params
    const b = await readJson(req).catch((): Record<string, unknown> => ({}))
    const want = b.rsvp !== false
    const db = adminDb()
    const sRef = sessionsCol(db).doc(id), aRef = db.collection('trainingAttendance').doc(attendanceId(id, actor.t.uid))
    return db.runTransaction(async tx => {
      const [sd, ad] = await Promise.all([tx.get(sRef), tx.get(aRef)])
      if (!sd.exists) throw new HttpError(404, 'That training session was not found.', 'BR-STU-001')
      const s = readSession(sd), now = Date.now()
      const st = effectiveStatus(s, now)
      if (st === 'closed' || st === 'confirmed' || now > s.endsAt) throw new HttpError(409, 'This session is over.', 'BR-STU-004')
      if (ad.get('removedAt') != null) throw new HttpError(403, 'You were removed from this session. Ask the trainer.', 'BR-STU-008')
      const has = ad.get('rsvpAt') != null
      if (want && !has) {
        if (s.rsvpCount >= s.capacity) throw new HttpError(409, 'This session is full.', 'BR-STU-009')
        tx.set(aRef, { uid: actor.t.uid, sessionId: id, rsvpAt: Timestamp.now() }, { merge: true })
        tx.update(sRef, { rsvpCount: FieldValue.increment(1) })
      } else if (!want && has && ad.get('checkedInAt') == null) {
        tx.update(aRef, { rsvpAt: FieldValue.delete() })
        tx.update(sRef, { rsvpCount: FieldValue.increment(-1) })
      }
      return { ok: true, rsvp: want ? true : ad.get('checkedInAt') != null && has }
    })
  })
}
