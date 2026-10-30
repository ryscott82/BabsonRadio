import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, readJson, str } from '@/lib/server/http'
import { studioActor } from '@/lib/server/studio'
import { assertClean } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// "Tell me about joining the club." One small document per member (clubInterest/{uid}).
export async function GET(req: Request) {
  return handle(async () => {
    const { t } = await studioActor(req)
    const d = await adminDb().collection('clubInterest').doc(t.uid).get()
    return { interested: d.get('interested') === true, note: String(d.get('note') ?? '') }
  })
}

// { interested: boolean, note?: string }
export async function POST(req: Request) {
  return handle(async () => {
    const { t } = await studioActor(req)
    const b = await readJson(req)
    const note = str(b.note, 300)
    const db = adminDb()
    if (note) await assertClean(db, note)
    const interested = b.interested === true
    await db.collection('clubInterest').doc(t.uid).set({ interested, note, updatedAt: Timestamp.now() })
    return { ok: true, interested, note }
  })
}
