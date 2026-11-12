import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { POPULAR_WEEKS, buildPopular, shouldRebuild, type HourRecord, type PastShow, type PopularDoc } from '../popularCore'

// popularTimes/current: averages only (listeners by hour of the week, per show category, with the station-wide average as the fallback).
// Built from data the site already records every hour (usageHours: listener-minutes per hour per show or playlist label, written by the now-playing tick)
// and the past approved shows. Rebuilt at most once a week, lazily, when someone opens /api/slots/options. No cron and no new sampling.
const REF = (db: Firestore) => db.collection('popularTimes').doc('current')
let memo: { at: number; v: PopularDoc | null } | null = null
let checkedUntil = 0
const READ_TTL = 5 * 60_000

/** The saved summary (1 read, kept 5 minutes per server instance and shared by everyone). */
export async function loadPopular(db: Firestore, now = Date.now()): Promise<PopularDoc | null> {
  if (memo && now - memo.at < READ_TTL) return memo.v
  const d = await REF(db).get()
  const v = d.exists ? (d.data() as PopularDoc) : null
  memo = { at: now, v }
  return v
}

/** Rebuilds when the summary is more than 7 days old. Checked at most every 5 minutes per instance; a claim stops two instances building at once. */
export async function maybeRebuildPopular(db: Firestore, now = Date.now()): Promise<boolean> {
  if (now < checkedUntil) return false
  checkedUntil = now + READ_TTL
  const cur = await loadPopular(db, now)
  if (!shouldRebuild(cur?.builtAt, now)) return false
  const claim = await db.runTransaction(async tx => {
    const d = await tx.get(REF(db))
    if (d.exists && !shouldRebuild(d.get('builtAt'), now)) return false
    if (now - Number(d.get('buildingAt') ?? 0) < 30 * 60_000) return false
    tx.set(REF(db), { buildingAt: now }, { merge: true })
    return true
  })
  if (!claim) return false
  const since = now - POPULAR_WEEKS * 7 * 86_400_000
  const [reqs, hours] = await Promise.all([
    db.collection('slotRequests').where('startAt', '>=', Timestamp.fromMillis(since)).where('startAt', '<', Timestamp.fromMillis(now)).select('status', 'category', 'title', 'startAt', 'endAt').get(),
    db.collection('usageHours').where('hourStart', '>=', since).select('hourStart', 'label', 'listenerMin').get(),
  ])
  const shows: PastShow[] = reqs.docs.filter(d => d.get('status') === 'approved').map(d => ({
    category: String(d.get('category') ?? 'other'), title: String(d.get('title') ?? ''), startAt: (d.get('startAt') as Timestamp).toMillis(), endAt: (d.get('endAt') as Timestamp).toMillis(),
  }))
  const records: HourRecord[] = hours.docs.map(d => ({ hourStart: Number(d.get('hourStart')), label: String(d.get('label') ?? ''), listenerMin: Number(d.get('listenerMin') ?? 0) }))
  const doc = buildPopular(shows, records, now)
  await REF(db).set(doc)
  memo = { at: now, v: doc }
  return true
}
export const resetPopular = () => { memo = null; checkedUntil = 0 }
