import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { currentOnAir } from '@/lib/server/live'
import { HttpError, handle, readJson, requireMember, requireUser, str } from '@/lib/server/http'
import { noteStars } from '@/lib/server/earnedEmojis'

export const runtime = 'nodejs'

// Rate a show 1-5 stars. The occurrence id comes from the live player (the show on air, or one that ended in the last 45 minutes).
const OCC = /^(weekly|slot|event)-([A-Za-z0-9_-]+)_(\d{10,14})$/

function check(occId: string, now: number) {
  const m = OCC.exec(occId)
  if (!m) throw new HttpError(400, 'That show can not be rated.')
  const startAt = Number(m[3])
  if (startAt > now || startAt < now - 12 * 3_600_000) throw new HttpError(400, 'That show can not be rated now.')
}

export async function GET(req: Request) {
  return handle(async () => {
    const occId = str(new URL(req.url).searchParams.get('occId'), 160)
    const now = Date.now()
    check(occId, now)
    const snap = await adminDb().collection('ratings').where('occId', '==', occId).get()
    const stars = snap.docs.map(d => d.get('stars') as number)
    const uid = await requireUser(req).then(t => t.uid, () => '')
    return {
      count: stars.length, avg: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : 0,
      mine: uid ? (snap.docs.find(d => d.get('uid') === uid)?.get('stars') ?? 0) : 0,
    }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const occId = str(b.occId, 160), stars = Number(b.stars)
    check(occId, Date.now())
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'Pick 1 to 5 stars.')
    const db = adminDb()
    const cur = await currentOnAir(db).catch(() => null)
    await db.collection('ratings').doc(`${occId}__${t.uid}`).set({
      occId, showKey: occId.replace(/_\d{10,14}$/, ''), uid: t.uid, stars, showTitle: str(b.title, 80),
      isShow: cur?.occId === occId ? cur.isShow : true, at: Timestamp.now(),
      ...(typeof b.comment === 'string' ? { comment: str(b.comment, 280) } : {}),
    }, { merge: true })
    await noteStars(db, t.uid, `h:${occId}`, stars).catch(() => {})
    return { ok: true }
  })
}
