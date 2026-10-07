import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { EMOJIS, bucketMinute, currentOnAir, reactionSummary } from '@/lib/server/live'

export const runtime = 'nodejs'

// Live reactions on whatever is on air. Anyone can see the counts; members can send one (a few per minute).
export async function GET() {
  return handle(async () => {
    const db = adminDb()
    const cur = await currentOnAir(db)
    if (!cur) return { occId: '', emojis: EMOJIS, recent: {}, total: {} }
    return { occId: cur.occId, emojis: EMOJIS, ...(await reactionSummary(db, cur.occId)) }
  })
}

const sent = new Map<string, number[]>() // best effort, per server instance

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const emoji = str((await readJson(req)).emoji, 8)
    if (!(EMOJIS as readonly string[]).includes(emoji)) throw new HttpError(400, 'Pick one of the reactions.')
    const now = Date.now()
    const recent = (sent.get(t.uid) ?? []).filter(x => now - x < 60_000)
    if (recent.length >= 20 || (recent.length && now - recent[recent.length - 1] < 700)) throw new HttpError(429, 'Easy there, try again in a second.')
    sent.set(t.uid, [...recent, now])

    const db = adminDb()
    const cur = await currentOnAir(db, now)
    if (!cur) throw new HttpError(409, 'Nothing is on air to react to.')
    const m = String(bucketMinute(now))
    await db.collection('reactions').doc(cur.occId).set({
      counts: { [emoji]: FieldValue.increment(1) },
      buckets: { [m]: { [emoji]: FieldValue.increment(1) } },
      showTitle: cur.item.title, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { ok: true }
  })
}
