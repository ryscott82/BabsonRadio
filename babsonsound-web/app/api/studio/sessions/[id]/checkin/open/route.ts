import { adminDb } from '@/lib/server/admin'
import { STAFF_NAME } from '@/lib/roleLabel'
import { HttpError, handle } from '@/lib/server/http'
import { assertCanManage, isTrainerUid, loadSession, sessionsCol, studioActor } from '@/lib/server/studio'
import { canOpenCheckin, effectiveStatus } from '@/lib/studioRules'

export const runtime = 'nodejs'

// Only the session's trainer (or an Admin) can open check-in, and the trainer must still be a Director or an Admin.
// It closes by itself 15 minutes after the session ends.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await studioActor(req, 'staff')
    const { id } = await params
    const db = adminDb()
    const s = await loadSession(db, id)
    assertCanManage(s, actor)
    const now = Date.now()
    if (effectiveStatus(s, now) === 'checkin_open') return { ok: true, status: 'checkin_open' }
    if (!(await isTrainerUid(db, s.trainerUid))) throw new HttpError(403, `This session needs ${STAFF_NAME} as its trainer.`, 'BR-STU-001')
    if (!canOpenCheckin({ status: s.status === 'checkin_open' ? 'closed' : s.status, endsAt: s.endsAt }, now)) throw new HttpError(409, 'Check-in cannot be opened for this session now.', 'BR-STU-004')
    await sessionsCol(db).doc(id).update({ status: 'checkin_open' })
    return { ok: true, status: 'checkin_open' }
  })
}
