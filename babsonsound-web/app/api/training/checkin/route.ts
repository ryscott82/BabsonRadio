import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { notifyAdmins } from '@/lib/server/push'
import { readiness } from '@/lib/server/conduct'

export const runtime = 'nodejs'

// "I'm at my training." Waits for a director or admin to confirm in /admin/training, then the quiz opens.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const db = adminDb()
    const r = await readiness(db, t)
    if (r.trained || r.checkIn !== 'none') return r
    const u = await db.collection('users').doc(t.uid).get()
    const name = [u.get('firstName') ?? '', u.get('lastName') ?? ''].join(' ').trim() || 'A student'
    await db.collection('training').doc(t.uid).set({
      checkInAt: Timestamp.now(), requesterName: name, requesterEmail: t.email ?? '',
    }, { merge: true })
    after(() => notifyAdmins('requests', { title: 'Training check-in', body: `${name} says they are at training. Confirm in Training.` }, t.uid))
    return { ...r, checkIn: 'pending' as const }
  })
}
