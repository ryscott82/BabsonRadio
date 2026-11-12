import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { BROADCAST_BODY_MAX, BROADCAST_TITLE_MAX, broadcastAudit, broadcastWait } from '@/lib/broadcastGuard'
import { notifyAnnouncements } from '@/lib/server/push'

export const runtime = 'nodejs'

// E-board and Admin send a notification to every phone that turned on station announcements ("Live from the quad at 6").
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const snap = await adminDb().collection('broadcasts').orderBy('at', 'desc').limit(20).get()
    const phones = (await adminDb().collection('deviceTokens').where('kinds', 'array-contains', 'announcements').count().get()).data().count
    return { phones, history: snap.docs.map(d => ({ id: d.id, title: d.get('title'), body: d.get('body'), at: d.get('at').toMillis(), sent: d.get('sent'), by: d.get('byName') ?? '' })) }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const title = str(b.title, BROADCAST_TITLE_MAX), body = str(b.body, BROADCAST_BODY_MAX)
    if (!title || !body) throw new HttpError(400, 'Add a title and a message.')
    const db = adminDb()
    // A guard against double-taps and mistakes: one announcement per person every 10 minutes.
    const recent = await db.collection('broadcasts').orderBy('at', 'desc').limit(20).get()
    const wait = broadcastWait(recent.docs.map(d => ({ by: String(d.get('by') ?? ''), at: d.get('at').toMillis() })), t.uid, Date.now())
    if (wait) throw new HttpError(429, wait)
    const sent = await notifyAnnouncements({ title, body })
    const u = await db.collection('users').doc(t.uid).get()
    await db.collection('broadcasts').add({ title, body, sent, by: t.uid, byName: u.get('firstName') ?? '', at: Timestamp.now() })
    await db.collection('hostActions').add(broadcastAudit(t.uid, title, sent, Timestamp.now()))
    return { ok: true, sent }
  })
}
