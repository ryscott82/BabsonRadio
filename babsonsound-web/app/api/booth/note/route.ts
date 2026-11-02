import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { assertClean } from '@/lib/server/wordFilter'
import { recordEvent } from '@/lib/server/booth'

export const runtime = 'nodejs'

// Leave a note on the studio PC for whoever signs in next: { sessionId, text }. Shown on the studio page for 24 hours.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if ((await accessOf(t)).level === 'guest') throw new HttpError(403, 'This is for Babson, Olin and Wellesley students.', 'BR-PERM-001')
    const db = adminDb()
    const b = await readJson(req)
    const text = str(b.text, 300)
    const sessionId = str(b.sessionId, 64)
    if (!text) throw new HttpError(400, 'Write a note first.')
    await assertClean(db, text, '')
    const u = await db.collection('users').doc(t.uid).get()
    await db.collection('boothNotes').add({ text, by: t.uid, byName: u.get('firstName') ?? u.get('displayName') ?? '', at: Timestamp.now() })
    if (sessionId) await recordEvent(db, sessionId, t.uid, 'note', text).catch(() => {})
    return { ok: true }
  })
}
