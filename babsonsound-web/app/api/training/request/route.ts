import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { handle, requireMember, readJson, str } from '@/lib/server/http'
import { notifyAdmins } from '@/lib/server/push'

export const runtime = 'nodejs'

// "I want in-person training." Shows up for directors in /admin/training and pushes to anyone who turned on request alerts.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const db = adminDb()
    const u = await db.collection('users').doc(t.uid).get()
    const name = [u.get('firstName') ?? '', u.get('lastName') ?? ''].join(' ').trim() || 'A student'
    await db.collection('training').doc(t.uid).set({
      requestedAt: Timestamp.now(), requestNote: str(b.note, 300), requesterName: name, requesterEmail: t.email ?? '',
    }, { merge: true })
    after(() => notifyAdmins('requests', { title: 'Training requested', body: `${name} wants to be trained to host.` }, t.uid))
    return { ok: true }
  })
}
