import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'

export const runtime = 'nodejs'

// Public: the auto-scheduled filler blocks coming up (what plays when no show is booked).
export async function GET() {
  return handle(async () => {
    const snap = await adminDb().collection('autoBlocks')
      .where('endAt', '>', Timestamp.now()).orderBy('endAt').limit(120).get()
    return {
      blocks: snap.docs.map(d => ({
        id: d.id, label: d.get('label'),
        startAt: d.get('startAt').toMillis(), endAt: d.get('endAt').toMillis(),
      })).sort((a, b) => a.startAt - b.startAt),
    }
  }, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' })
}
