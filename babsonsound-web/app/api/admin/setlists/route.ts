import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, requireStaff } from '@/lib/server/http'

export const runtime = 'nodejs'

// Set lists typed in by hosts, newest first (for the admin Set lists page and exports).
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('setlists').orderBy('startAt', 'desc').limit(200).get()
    return {
      items: snap.docs.map(d => ({
        id: d.id, showTitle: d.get('showTitle') ?? '', startAt: (d.get('startAt') as Timestamp).toMillis(),
        songs: d.get('songs') ?? '', songCount: d.get('songCount') ?? 0,
      })),
    }
  })
}
