import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { hostContext, occurrenceId } from '@/lib/server/host'

export const runtime = 'nodejs'

// A host marks a playlist request from their own show as added (or undoes it).
export async function POST(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const c = await hostContext(req, db)
    const b = await readJson(req)
    const ref = db.collection('playlistRequests').doc(str(b.id, 80))
    const d = await ref.get()
    const mineShow = c.shows.some(s => occurrenceId(s) === d.get('occId'))
    if (!d.exists || (!mineShow && !c.staff)) throw new HttpError(403, "That request isn't from your show.", 'BR-HST-002')
    await ref.update({ done: b.done === true })
    return { ok: true }
  })
}
