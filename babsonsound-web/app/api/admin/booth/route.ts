import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireAdmin, requireDirector } from '@/lib/server/http'
import { adPlan } from '@/lib/server/booth'
import { cleanAdPlan } from '@/lib/booth'

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
    if (new URL(req.url).searchParams.get('ads') === '1') return { ads: await adPlan(db) }
    const snap = await db.collection('boothSessions').orderBy('startedAt', 'desc').limit(300).get()
    return {
      sessions: snap.docs.map(d => ({
        id: d.id, name: d.get('name') ?? '', email: d.get('email') ?? '', level: d.get('level') ?? '',
        startedAt: ms(d.get('startedAt')), lastSeenAt: ms(d.get('lastSeenAt')), endedAt: ms(d.get('endedAt')),
        endReason: d.get('endReason') ?? '', liveCount: d.get('liveCount') ?? 0, songCount: d.get('songCount') ?? 0, musicCount: d.get('musicCount') ?? 0,
        onAirMs: (d.get('onAirMs') ?? 0) + (d.get('liveSince') ? Date.now() - ms(d.get('liveSince')) : 0),
        live: !!d.get('liveSince'),
      })),
    }
  })
}

// Ad break times for the studio PC countdown (admins): { ads: { enabled, minutes, lengthSec } }.
export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const b = await readJson(req)
    const ads = cleanAdPlan(b.ads)
    await adminDb().collection('config').doc('booth').set({ ads }, { merge: true })
    return { ads }
  })
}
