import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('feedback').orderBy('createdAt', 'desc').limit(150).get()
    return {
      items: snap.docs.map(d => ({
        id: d.id, type: d.get('type'), message: d.get('message'), name: d.get('name'), email: d.get('email'),
        platform: d.get('platform'), appVersion: d.get('appVersion'), page: d.get('page'),
        target: d.get('target') ?? null, status: d.get('status') ?? 'new', createdAt: d.get('createdAt').toMillis(),
      })),
    }
  })
}

// Mark a report done (or reopen it).
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const id = str(b.id, 100)
    if (!id || (b.status !== 'new' && b.status !== 'done')) throw new HttpError(400, 'Invalid request.')
    await adminDb().collection('feedback').doc(id).update({ status: b.status })
    return { ok: true }
  })
}
