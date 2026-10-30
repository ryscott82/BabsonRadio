import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { assertCanManage, loadSession, sessionsCol, studioActor } from '@/lib/server/studio'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await studioActor(req, 'staff')
    const { id } = await params
    const db = adminDb()
    const s = await loadSession(db, id)
    assertCanManage(s, actor)
    if (s.status === 'checkin_open') await sessionsCol(db).doc(id).update({ status: 'closed' })
    return { ok: true, status: s.status === 'checkin_open' ? 'closed' : s.status }
  })
}
