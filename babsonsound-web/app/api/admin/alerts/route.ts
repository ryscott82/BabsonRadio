import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector, isDeveloperToken } from '@/lib/server/http'

export const runtime = 'nodejs'

// What needs attention: new slot requests, new bug reports and ideas, and recent cancellations (with reasons).
// Directors see slot requests and cancellations; admins also see reports.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const db = adminDb()
    const admin = isDeveloperToken(t) || (await db.collection('users').doc(t.uid).get()).get('role') === 'superAdmin'
    const pending = await db.collection('slotRequests').where('status', '==', 'pending').get()
    const since = Date.now() - 14 * 86_400_000
    const cancelled = await db.collection('slotRequests').where('status', '==', 'cancelled').get()
    const cancellations = cancelled.docs
      .filter(d => (d.get('cancelledAt')?.toMillis?.() ?? 0) > since)
      .map(d => ({
        id: d.id, title: d.get('title'), requesterName: d.get('requesterName') ?? '', startAt: d.get('startAt').toMillis(),
        cancelledAt: d.get('cancelledAt').toMillis(), reason: d.get('cancelReason') ?? '', wasApproved: d.get('cancelledFrom') === 'approved',
      }))
      .sort((a, b) => b.cancelledAt - a.cancelledAt).slice(0, 20)
    let newReports = 0
    if (admin) newReports = (await db.collection('feedback').where('status', '==', 'new').get()).size
    return { pendingRequests: pending.size, newReports: admin ? newReports : null, cancellations }
  })
}
