import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson } from '@/lib/server/http'
import { assertCanManage, loadSession, sessionsCol, settleStatus, studioActor } from '@/lib/server/studio'

export const runtime = 'nodejs'

// { uids?: string[] } — the trainer confirms who really attended (everyone checked in and not removed, unless uids narrows it).
// A confirmed row is what opens the quiz; the badge itself comes from passing the quiz and signing the agreement.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await studioActor(req, 'staff')
    const { id } = await params
    const b = await readJson(req).catch((): Record<string, unknown> => ({}))
    const db = adminDb()
    const s = await settleStatus(db, await loadSession(db, id), Date.now())
    assertCanManage(s, actor)
    if (s.status === 'checkin_open') throw new HttpError(409, 'Close check-in first.', 'BR-STU-011')
    if (s.status === 'scheduled') throw new HttpError(409, 'Nobody has checked in yet.', 'BR-STU-011')
    const only = Array.isArray(b.uids) ? new Set(b.uids.map(String)) : null
    const snap = await db.collection('trainingAttendance').where('sessionId', '==', id).get()
    const rows = snap.docs.filter(d => d.get('checkedInAt') != null && d.get('removedAt') == null && d.get('confirmedAt') == null && (!only || only.has(String(d.get('uid')))))
    const now = Timestamp.now()
    for (let i = 0; i < rows.length; i += 400) {
      const batch = db.batch()
      rows.slice(i, i + 400).forEach(d => batch.update(d.ref, { confirmedBy: actor.t.uid, confirmedAt: now }))
      await batch.commit()
    }
    await sessionsCol(db).doc(id).update({ status: 'confirmed', confirmedAt: now, confirmedBy: actor.t.uid })
    return { ok: true, confirmed: rows.length }
  })
}

