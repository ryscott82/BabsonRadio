import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { attendanceId, clearWrongCodes, countTry, loadSession, must, ms, recordWrongCode, settleStatus, studioActor } from '@/lib/server/studio'
import { checkinGate, codeMatches } from '@/lib/studioRules'

export const runtime = 'nodejs'

// { code } — a verified Student checks in to a session with the rotating code. One check-in per person per session.
// 5 tries a minute per person, locked 15 minutes after 10 wrong codes; wrong codes are logged (trainingCheckinLog).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await studioActor(req)
    const { id } = await params
    const code = str((await readJson(req)).code, 12).replace(/\s/g, '')
    const db = adminDb()
    const uid = actor.t.uid
    const now = Date.now()

    const s = await settleStatus(db, await loadSession(db, id), now)
    const aRef = db.collection('trainingAttendance').doc(attendanceId(id, uid))
    const prev = await aRef.get()
    const gate = () => checkinGate({
      level: actor.a.level, emailVerified: actor.t.email_verified === true, demo: actor.a.demo, status: s.status,
      row: prev.exists ? { checkedInAt: ms(prev.get('checkedInAt')), removedAt: ms(prev.get('removedAt')) } : null,
    })
    must(gate())

    const fails = await countTry(db, uid, now) // every try counts, right or wrong
    if (!codeMatches(s.checkinSecret, code, now)) {
      await recordWrongCode(db, uid, id, now)
      throw new HttpError(403, 'That code did not work. Check the screen and try again.', 'BR-STU-010')
    }
    // The gate above is the fast path; the transaction is what guarantees ONE check-in per person even with two taps at once.
    await db.runTransaction(async tx => {
      const row = await tx.get(aRef)
      if (row.get('removedAt') != null) throw new HttpError(403, 'You were removed from this session. Ask the trainer.', 'BR-STU-008')
      if (row.get('checkedInAt') != null) throw new HttpError(409, 'You are already checked in.', 'BR-STU-007')
      tx.set(aRef, { uid, sessionId: id, checkedInAt: Timestamp.fromMillis(now) }, { merge: true })
    })
    if (fails > 0) await clearWrongCodes(db, uid)
    return { ok: true, checkedInAt: now, title: s.title }
  })
}
