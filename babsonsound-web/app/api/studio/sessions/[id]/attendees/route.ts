import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { assertCanManage, loadSession, ms, namesFor, publicSession, studioActor } from '@/lib/server/studio'

export const runtime = 'nodejs'

// Trainer or Admin: who saved a spot, who checked in, who was removed, who is confirmed.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await studioActor(req, 'staff')
    const { id } = await params
    const db = adminDb()
    const s = await loadSession(db, id)
    assertCanManage(s, actor)
    const snap = await db.collection('trainingAttendance').where('sessionId', '==', id).get()
    const names = await namesFor(db, [...snap.docs.map(d => String(d.get('uid'))), s.trainerUid])
    const attendees = snap.docs.map(d => {
      const uid = String(d.get('uid'))
      return {
        uid, name: names.get(uid)?.name ?? '', email: names.get(uid)?.email ?? '',
        rsvpAt: ms(d.get('rsvpAt')), checkedInAt: ms(d.get('checkedInAt')), removedAt: ms(d.get('removedAt')), removedBy: d.get('removedBy') ?? null,
        confirmedAt: ms(d.get('confirmedAt')), confirmedBy: d.get('confirmedBy') ?? null, grantedAt: ms(d.get('grantedAt')),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
    return { session: publicSession(s, Date.now(), names.get(s.trainerUid)?.name ?? ''), attendees }
  })
}
