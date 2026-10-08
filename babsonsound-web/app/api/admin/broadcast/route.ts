import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { notifyAnnouncements } from '@/lib/server/push'

export const runtime = 'nodejs'

// Staff send a notification to every phone that turned on station announcements ("Live from the quad at 6").
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('broadcasts').orderBy('at', 'desc').limit(20).get()
    const phones = (await adminDb().collection('deviceTokens').where('kinds', 'array-contains', 'announcements').count().get()).data().count
    return { phones, history: snap.docs.map(d => ({ id: d.id, title: d.get('title'), body: d.get('body'), at: d.get('at').toMillis(), sent: d.get('sent'), by: d.get('byName') ?? '' })) }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    const title = str(b.title, 60), body = str(b.body, 160)
    if (!title || !body) throw new HttpError(400, 'Add a title and a message.')
    const db = adminDb()
    // A guard against double-taps and mistakes: one announcement every 2 minutes.
    const last = await db.collection('broadcasts').orderBy('at', 'desc').limit(1).get()
    if (!last.empty && Date.now() - last.docs[0].get('at').toMillis() < 120_000) throw new HttpError(429, 'Wait a couple of minutes before sending another.')
    const sent = await notifyAnnouncements({ title, body })
    const u = await db.collection('users').doc(t.uid).get()
    await db.collection('broadcasts').add({ title, body, sent, by: t.uid, byName: u.get('firstName') ?? '', at: Timestamp.now() })
    return { ok: true, sent }
  })
}
