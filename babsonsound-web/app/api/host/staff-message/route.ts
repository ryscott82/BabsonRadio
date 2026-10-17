import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { hostContext } from '@/lib/server/host'
import { notifyAdmins } from '@/lib/server/push'
import { assertClean } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// A host on air sends a short note to the station staff (admins get a push). Hosts: inside the window of their own show.
export async function POST(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const c = await hostContext(req, db)
    if (!c.staff && c.open.length === 0) throw new HttpError(403, 'Messages open 4 hours before your show.', 'BR-HST-001')
    const text = str((await readJson(req)).text, 280)
    if (text.length < 2) throw new HttpError(400, 'Write a message first.')
    await assertClean(db, text)

    const rate = db.collection('hostRate').doc(c.t.uid)
    const last = (await rate.get()).get('lastStaffMsgAt') as Timestamp | undefined
    if (last && Date.now() - last.toMillis() < 30_000) throw new HttpError(429, 'Wait a few seconds before sending another.')
    await rate.set({ lastStaffMsgAt: Timestamp.now() }, { merge: true })

    const u = await db.collection('users').doc(c.t.uid).get()
    const name = String(u.get('firstName') ?? u.get('displayName') ?? 'A host')
    const show = c.open[0]?.title ?? '(staff)'
    await db.collection('staffMessages').add({ uid: c.t.uid, name, show, text, at: Timestamp.now() })
    after(() => notifyAdmins('ops', { title: `${name} · ${show}`, body: text }, c.t.uid))
    return { ok: true }
  })
}
