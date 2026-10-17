import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff, str } from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('submissions').orderBy('at', 'desc').limit(200).get()
    return {
      submissions: snap.docs.map(d => ({
        id: d.id, kind: d.get('kind') as string, name: d.get('name') ?? '', title: d.get('title') ?? '', artist: d.get('artist') ?? '',
        url: d.get('url') ?? '', note: d.get('note') ?? '', at: d.get('at').toMillis() as number, done: d.get('done') === true,
      })),
    }
  })
}

// { id, done } marks one handled; { id, remove: true } deletes it.
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const ref = adminDb().collection('submissions').doc(str(b.id, 80))
    if (b.remove === true) await ref.delete()
    else await ref.update({ done: b.done === true })
    return { ok: true }
  })
}
