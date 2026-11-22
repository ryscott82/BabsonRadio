import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, HttpError, handle, readJson, str } from '@/lib/server/http'
import { requireBoothCaller } from '@/lib/server/booth'
import { assertClean, censor } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// A guest on the show (an interviewee, say) is added on the studio PC by typing their name and email: { sessionId, name, email, wantsLink }.
// No account, no training. Saved under the show's session (boothSessions/{id}/guests, server only); the PC credits the name in the show's host list.
// The guest gets no control of the booth. Needs the studio PC's signed nonce, or a signed-in student.
export async function POST(req: Request) {
  return handle(async () => {
    await requireBoothCaller(req)
    const db = adminDb()
    const b = await readJson(req)
    const sessionId = str(b.sessionId, 64)
    const name = str(b.name, 60).replace(/\s+/g, ' ').trim()
    const email = str(b.email, 200).trim().toLowerCase()
    if (!sessionId) throw new HttpError(400, 'Sign in on the studio PC first.')
    if (!name) throw new HttpError(400, 'Type the guest’s name.')
    if (!ANY_EMAIL.test(email)) throw new HttpError(400, 'That doesn’t look like an email address.')
    await assertClean(db, name, '')
    const session = await db.collection('boothSessions').doc(sessionId).get()
    if (!session.exists) throw new HttpError(404, 'That session has ended. Sign in again.')
    const id = createHash('sha256').update(email).digest('hex').slice(0, 40)
    await session.ref.collection('guests').doc(id).set({ name, email, wantsLink: b.wantsLink !== false, addedAt: Timestamp.now() }, { merge: true })
    return { ok: true, name: censor(name) }
  }, { 'Cache-Control': 'private, no-store' })
}
