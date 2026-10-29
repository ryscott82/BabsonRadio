import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { currentOnAir } from '@/lib/server/live'
import { HttpError, handle, readJson, requireMember, requireUser, str } from '@/lib/server/http'
import { bump, noteStars } from '@/lib/server/earnedEmojis'
import { assertClean } from '@/lib/server/wordFilter'

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
    const snap = await adminDb().collection('ratings').where('occId', '==', occId).get()
    const stars = snap.docs.map(d => d.get('stars') as number)
    const uid = anon ? '' : await requireUser(req).then(t => t.uid, () => '')
    return {
      count: stars.length, avg: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : 0,
      mine: uid ? (snap.docs.find(d => d.get('uid') === uid)?.get('stars') ?? 0) : 0,
    }
  }, { 'Cache-Control': anon ? 'public, s-maxage=10, stale-while-revalidate=20' : 'private, no-store' })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const occId = str(b.occId, 160), stars = Number(b.stars)
    check(occId, Date.now())
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'Pick 1 to 5 stars.')
    const db = adminDb()
    await assertClean(db, ...(typeof b.comment === 'string' ? [str(b.comment, 280)] : []), str(b.title, 80))
    const cur = await currentOnAir(db).catch(() => null)
    await db.collection('ratings').doc(`${occId}__${t.uid}`).set({
      occId, showKey: occId.replace(/_\d{10,14}$/, ''), uid: t.uid, stars, showTitle: str(b.title, 80),
      isShow: cur?.occId === occId ? cur.isShow : true, at: Timestamp.now(),
      ...(typeof b.comment === 'string' ? { comment: str(b.comment, 280) } : {}),
    }, { merge: true })
    await noteStars(db, t.uid, `h:${occId}`, stars).catch(() => {})
    await bump(db, t.uid)
    return { ok: true }
  })
}
