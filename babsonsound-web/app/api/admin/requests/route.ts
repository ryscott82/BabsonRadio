import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff, str } from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('songRequests').orderBy('at', 'desc').limit(200).get()
    return {
      requests: snap.docs.map(d => ({ id: d.id, name: d.get('name') ?? '', text: d.get('text') ?? '', at: d.get('at').toMillis(), done: d.get('done') === true })),
    }
  })
}

// { id, done } marks one played/handled; { id, remove: true } deletes it.
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const ref = adminDb().collection('songRequests').doc(str(b.id, 80))
    if (b.remove === true) await ref.delete()
    else await ref.update({ done: b.done === true })
    return { ok: true }
  })
}
