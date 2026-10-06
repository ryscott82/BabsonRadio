import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const snap = await adminDb().collection('slotRequests').where('requesterUid', '==', t.uid).get()
    const requests = snap.docs.map(d => {
      const approved = d.get('status') === 'approved'
      return {
        id: d.id, title: d.get('title'), description: d.get('description'),
        type: d.get('type'), category: d.get('category'), audioURL: d.get('audioURL') ?? '',
        startAt: d.get('startAt').toMillis(), endAt: d.get('endAt').toMillis(),
        durationMin: d.get('durationMin'), status: d.get('status'),
        staffNote: d.get('staffNote') ?? '',
        connectionInfo: approved ? (d.get('connectionInfo') ?? '') : '',
        createdAt: d.get('createdAt').toMillis(),
      }
    }).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
    return { requests }
  })
}
