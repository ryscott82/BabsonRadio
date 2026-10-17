import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { EMOJIS, bucketMinute, currentOnAir, hostPrefsFor } from '@/lib/server/live'
import { themedEmojis } from '@/lib/server/easterEggs'
import { EARNED_EMOJIS, bump, emojisFor } from '@/lib/server/earnedEmojis'

export const runtime = 'nodejs'

// Live reactions. Built to cost almost nothing however many people listen:
//  - GET is the same for everybody, so Vercel's edge caches it for 2 seconds and most polls never reach our code.
//  - Behind that, each server instance reads only the reactions it has not seen yet (never the same one twice).
//  - Very busy minutes are capped, so one night can not run up a bill. Counts are still kept.
interface Ev { at: number; e: string; c: string }
const WINDOW_MS = 30_000
const STORE_CAP_PER_MIN = 150 // reactions per minute that get stored as individual events

const feed = new Map<string, { list: Ev[]; seen: number; fetchedAt: number }>()

async function recentEvents(db: Firestore, occId: string, now: number): Promise<Ev[]> {
  const f = feed.get(occId) ?? { list: [], seen: now - WINDOW_MS, fetchedAt: 0 }
  if (now - f.fetchedAt >= 2_000) {
    const snap = await db.collection('reactions').doc(occId).collection('rxEvents')
      .where('at', '>', f.seen).orderBy('at').limit(150).get()
    for (const d of snap.docs) f.list.push({ at: d.get('at') as number, e: String(d.get('e')), c: String(d.get('c') ?? '') })
    if (snap.size) f.seen = f.list[f.list.length - 1].at
    f.fetchedAt = now
  }
  f.list = f.list.filter(x => x.at > now - WINDOW_MS)
  feed.set(occId, f)
  return f.list
}

export async function GET() {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const cur = await currentOnAir(db, now)
    if (!cur) return { occId: '', emojis: EMOJIS, events: [], now }
    const mine = (await hostPrefsFor(db, cur).catch(() => null))?.emojis ?? []
    return { occId: cur.occId, emojis: mine.length ? mine : EMOJIS, events: await recentEvents(db, cur.occId, now), now }
  }, { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=4' })
}

const sent = new Map<string, number[]>() // best effort, per server instance
const invisibleCache = new Map<string, { at: number; v: boolean }>()
async function isInvisible(db: Firestore, uid: string, now: number): Promise<boolean> {
  const hit = invisibleCache.get(uid)
  if (hit && now - hit.at < 60_000) return hit.v
  const v = (await db.collection('users').doc(uid).get()).get('invisible') === true
  invisibleCache.set(uid, { at: now, v })
  return v
}
const stored = { minute: 0, n: 0 }

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const emoji = str(b.emoji, 24)
    const cid = str(b.cid, 24).replace(/[^A-Za-z0-9]/g, '')
    const earned = (EARNED_EMOJIS as readonly string[]).includes(emoji)
    const dbAll = adminDb()
    const themed = (await themedEmojis(dbAll)).has(emoji)
    const curNow = await currentOnAir(dbAll).catch(() => null)
    const hostSet = curNow ? (await hostPrefsFor(dbAll, curNow).catch(() => null))?.emojis ?? [] : []
    const base: readonly string[] = hostSet.length ? hostSet : EMOJIS
    if (!earned && !themed && !base.includes(emoji)) throw new HttpError(400, 'Pick one of the reactions.')
    if (earned && !(await emojisFor(dbAll, t.uid)).includes(emoji)) throw new HttpError(400, 'Pick one of the reactions.')
    const now = Date.now()
    const recent = (sent.get(t.uid) ?? []).filter(x => now - x < 60_000)
    if (recent.length >= 30 || (recent.length && now - recent[recent.length - 1] < 500)) throw new HttpError(429, 'Easy there, try again in a second.')
    sent.set(t.uid, [...recent, now])

    const db = adminDb()
    if (await isInvisible(db, t.uid, now)) throw new HttpError(403, 'Reactions are off while Invisible mode is on.', 'BR-LIV-002')
    const cur = await currentOnAir(db, now)
    if (!cur) throw new HttpError(409, 'Nothing is on air to react to.')
    const m = bucketMinute(now)
    if (stored.minute !== m) { stored.minute = m; stored.n = 0 }
    const ref = db.collection('reactions').doc(cur.occId)
    await ref.set({
      counts: { [emoji]: FieldValue.increment(1) },
      buckets: { [String(m)]: { [emoji]: FieldValue.increment(1) } },
      showTitle: cur.item.title, isShow: cur.isShow, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (++stored.n <= STORE_CAP_PER_MIN) {
      // exp lets a Firestore TTL policy on the rxEvents collection group clean these up (optional).
      await ref.collection('rxEvents').add({ at: now, e: emoji, c: cid, exp: Timestamp.fromMillis(now + 24 * 3_600_000) })
    }
    await bump(db, t.uid)
    return { ok: true }
  })
}
