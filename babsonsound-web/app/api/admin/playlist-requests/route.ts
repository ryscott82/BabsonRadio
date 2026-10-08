import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff, str } from '@/lib/server/http'
import { rowOf } from '@/lib/server/playlistRequests'

export const runtime = 'nodejs'

// Every playlist request, newest first. Staff see all of them, whether the auto DJ or a host's show was on air.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('playlistRequests').orderBy('at', 'desc').limit(300).get()
    return { requests: snap.docs.map(rowOf) }
  })
}

// { id, done } marks one added or not; { id, remove: true } deletes it.
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const ref = adminDb().collection('playlistRequests').doc(str(b.id, 80))
    if (b.remove === true) await ref.delete()
    else await ref.update({ done: b.done === true })
    return { ok: true }
  })
}
