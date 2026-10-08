import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { azPlayNext, azSearchSongs, azuraConfigured } from '@/lib/server/azuracast'

export const runtime = 'nodejs'

// Admins only. GET ?q=… searches the library; POST { requestId, label } plays that song next, ahead of votes and the schedule.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80)
    if (q.length < 2) return { songs: [] }
    if (!azuraConfigured()) throw new HttpError(503, 'The radio controls are not connected yet.', 'BR-HST-003')
    try { return { songs: await azSearchSongs(q) } }
    catch (e) { console.error('[play-next search]', e); throw new HttpError(502, 'Could not search the library.', 'BR-HST-003') }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    const requestId = str(b.requestId, 200)
    if (!requestId) throw new HttpError(400, 'Choose a song first.')
    if (!azuraConfigured()) throw new HttpError(503, 'The radio controls are not connected yet.', 'BR-HST-003')
    try { await azPlayNext(requestId) }
    catch (e) {
      console.error('[play-next]', e)
      throw new HttpError(502, 'The radio did not accept that. The song’s playlist must allow requests, and the key needs station permissions.', 'BR-HST-003')
    }
    await adminDb().collection('hostActions').add({ uid: t.uid, action: 'play-next', song: str(b.label, 160), show: '(admin)', at: Timestamp.now() })
    return { ok: true }
  })
}
