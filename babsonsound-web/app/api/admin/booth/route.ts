import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'

export const runtime = 'nodejs'

const ms = (v: unknown) => (v as Timestamp | undefined)?.toMillis?.() ?? 0

// Studio PC sign-in log for directors and admins. ?sessionId= returns that session's events.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const db = adminDb()
    const sessionId = new URL(req.url).searchParams.get('sessionId')
    if (sessionId) {
      const ev = await db.collection('boothEvents').where('sessionId', '==', sessionId).limit(500).get()
      return {
        events: ev.docs.map(d => ({ id: d.id, kind: d.get('kind'), text: d.get('text') ?? '', at: ms(d.get('at')) })).sort((a, b) => a.at - b.at),
      }
    }
    const snap = await db.collection('boothSessions').orderBy('startedAt', 'desc').limit(300).get()
    return {
      sessions: snap.docs.map(d => ({
        id: d.id, name: d.get('name') ?? '', email: d.get('email') ?? '', level: d.get('level') ?? '',
        startedAt: ms(d.get('startedAt')), lastSeenAt: ms(d.get('lastSeenAt')), endedAt: ms(d.get('endedAt')),
        endReason: d.get('endReason') ?? '', liveCount: d.get('liveCount') ?? 0, songCount: d.get('songCount') ?? 0,
        onAirMs: (d.get('onAirMs') ?? 0) + (d.get('liveSince') ? Date.now() - ms(d.get('liveSince')) : 0),
        live: !!d.get('liveSince'),
      })),
    }
  })
}
