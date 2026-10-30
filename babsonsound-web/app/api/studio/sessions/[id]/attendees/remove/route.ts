import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { assertCanManage, attendanceId, loadSession, studioActor } from '@/lib/server/studio'

export const runtime = 'nodejs'

// { uid } — take someone off the list (for example they checked in but left). Not allowed once they are confirmed;
// after that an Admin revokes the grant instead.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await studioActor(req, 'staff')
    const { id } = await params
    const uid = str((await readJson(req)).uid, 128)
    if (!uid) throw new HttpError(400, 'Pick a person.')
    const db = adminDb()
    assertCanManage(await loadSession(db, id), actor)
    const ref = db.collection('trainingAttendance').doc(attendanceId(id, uid))
    const row = await ref.get()
    if (!row.exists) throw new HttpError(404, 'That person is not on this session.', 'BR-STU-001')
    if (row.get('confirmedAt') != null) throw new HttpError(409, 'They are already confirmed. An admin can revoke their badge instead.', 'BR-STU-018')
    await ref.update({ removedBy: actor.t.uid, removedAt: Timestamp.now() })
    return { ok: true }
  })
}
