import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { requireLibrary } from '@/lib/server/guests'
import { requestsStatus } from '@/lib/server/live'

export const runtime = 'nodejs'

// A free-text artist or song request. Only allowed while a live show's DJ has turned requests on; never for the auto DJ.
// The host sees them in their panel, and staff see them under Admin > Listener requests.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const b = await readJson(req)
    const text = str(b.text, 140)
    if (text.length < 2) throw new HttpError(400, 'Type an artist or song.')
    const db = adminDb()
    const st = await requestsStatus(db)
    if (!st.open) throw new HttpError(403, 'Requests are only open when a DJ turns them on during their show.')
    const mine = await db.collection('songRequests').where('uid', '==', t.uid).get()
    const dayAgo = Date.now() - 24 * 3600_000
    if (mine.docs.filter(d => d.get('at').toMillis() > dayAgo).length >= 5) {
      throw new HttpError(429, 'You can send 5 requests a day. Try again tomorrow.')
    }
    await db.collection('songRequests').add({
      uid: t.uid, name: str(t.name, 60) || 'Listener', text, at: Timestamp.now(), done: false,
      occId: st.occId, showTitle: st.showTitle,
    })
    return { ok: true }
  })
}
