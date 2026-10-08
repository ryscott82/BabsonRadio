import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { requireLibrary } from '@/lib/server/guests'

export const runtime = 'nodejs'

// A free-text artist or song request. Only staff see these (Admin > Listener requests); nothing plays automatically.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const b = await readJson(req)
    const text = str(b.text, 140)
    if (text.length < 2) throw new HttpError(400, 'Type an artist or song.')
    const db = adminDb()
    const mine = await db.collection('songRequests').where('uid', '==', t.uid).get()
    const dayAgo = Date.now() - 24 * 3600_000
    if (mine.docs.filter(d => d.get('at').toMillis() > dayAgo).length >= 5) {
      throw new HttpError(429, 'You can send 5 requests a day. Try again tomorrow.')
    }
    await db.collection('songRequests').add({
      uid: t.uid, name: str(t.name, 60) || 'Listener', text, at: Timestamp.now(), done: false,
    })
    return { ok: true }
  })
}
