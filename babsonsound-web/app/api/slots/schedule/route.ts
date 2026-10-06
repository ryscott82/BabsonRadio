import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'

export const runtime = 'nodejs'

// Upcoming approved slots (also what the app uses to grey out taken times).
export async function GET(req: Request) {
  return handle(async () => {
    await requireMember(req)
    const snap = await adminDb().collection('airSlots')
      .where('endAt', '>', Timestamp.now()).orderBy('endAt').limit(100).get()
    return {
      slots: snap.docs.map(d => ({
        id: d.id, title: d.get('title'), hostName: d.get('hostName'),
        type: d.get('type'), category: d.get('category'),
        startAt: d.get('startAt').toMillis(), endAt: d.get('endAt').toMillis(),
      })).sort((a, b) => a.startAt - b.startAt),
    }
  })
}
