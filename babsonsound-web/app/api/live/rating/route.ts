import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { currentOnAir } from '@/lib/server/live'
import { HttpError, handle, readJson, requireMember, requireUser, str } from '@/lib/server/http'
import { bump, noteStars } from '@/lib/server/earnedEmojis'
import { assertClean } from '@/lib/server/wordFilter'
import { forgetRatings, ratingRows, ratingSummary } from '@/lib/server/liveData'
import { forgetOld, oldPoll } from '@/lib/server/oldRoute'
import { throttled } from '@/lib/server/tierGate'

export const runtime = 'nodejs'

// Rate a show 1-5 stars. The occurrence id comes from the live player (the show on air, or one that ended in the last 45 minutes).
// Shows have ids like weekly-<id>_<start>; playlist blocks (the auto DJ) are genre-<name>_<start>, and a name can hold spaces or &.
const OCC = /^(weekly|slot|event|genre)-([^/]{1,100})_(\d{10,14})$/

function check(occId: string, now: number) {
  const m = OCC.exec(occId)
  if (!m) throw new HttpError(400, 'That show can not be rated.')
  const startAt = Number(m[3])
  if (startAt > now || startAt < now - 12 * 3_600_000) throw new HttpError(400, 'That show can not be rated now.')
}

export async function GET(req: Request) {
  // Signed-out callers get the same answer as everyone else (no "mine"), so it can be cached at the edge for a few seconds,
  // like /api/presence. Requests with a sign-in header are never shared.
  const anon = !req.headers.get('authorization')
  return handle(async () => {
    const occId = str(new URL(req.url).searchParams.get('occId'), 160)
    const now = Date.now()
    check(occId, now)
    const uid = anon ? '' : await requireUser(req).then(t => t.uid, () => '')
    const read = async () => {
      const rows = await ratingRows(adminDb(), occId, now)
      return { ...ratingSummary(rows), mine: uid ? (rows.find(r => r.uid === uid)?.stars ?? 0) : 0 }
    }
    // Signed-in readers are older apps: the last answer for a minute (lib/server/oldRoute.ts). Signed-out readers share an edge copy.
    return uid ? throttled('rating', uid, { count: 0, avg: 0, mine: 0 }, () => oldPoll('rating', uid, read)) : read()
  }, { 'Cache-Control': anon ? 'public, s-maxage=60, stale-while-revalidate=120' : 'private, max-age=15' })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const occId = str(b.occId, 160), stars = Number(b.stars)
    check(occId, Date.now())
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'Pick 1 to 5 stars.')
    return throttled('rating', t.uid, { ok: true }, () => rate(t.uid, occId, stars, b), 'w')
  })
}

async function rate(uid: string, occId: string, stars: number, b: Record<string, unknown>) {
  {
    const t = { uid }
    const db = adminDb()
    await assertClean(db, ...(typeof b.comment === 'string' ? [str(b.comment, 280)] : []), str(b.title, 80))
    const cur = await currentOnAir(db).catch(() => null)
    await db.collection('ratings').doc(`${occId}__${t.uid}`).set({
      occId, showKey: occId.replace(/_\d{10,14}$/, ''), uid: t.uid, stars, showTitle: str(b.title, 80),
      isShow: cur?.occId === occId ? cur.isShow : true, at: Timestamp.now(),
      ...(typeof b.comment === 'string' ? { comment: str(b.comment, 280) } : {}),
    }, { merge: true })
    forgetRatings(occId)
    await noteStars(db, t.uid, `h:${occId}`, stars).catch(() => {})
    await bump(db, t.uid)
    forgetOld('rating', uid)
    return { ok: true }
  }
}
