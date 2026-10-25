import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'

// What listeners like, per genre block or show, learned from four signals over the last 60 days:
// how many people were listening, song ratings, block/show ratings, and reactions per listener.
// Each signal is compared with the station average and pulled toward it when there is little data,
// so one rating can not swing the schedule. The result is a weight per label (1 = average).

import { DAYPARTS, daypartOf, type Daypart } from '@/lib/autoschedule'

const DAYS = 60
const K = 8 // how much data it takes before a label's own numbers outweigh the average

export interface LabelStats {
  label: string
  listeners: number; samples: number
  songStars: number; songRatings: number
  blockStars: number; blockRatings: number
  reactions: number
  weight: number
  /** The same weight for each time of day (listeners at that time, blended with the overall weight). */
  parts: Record<Daypart, number>
}

const key = (s: string) => s.trim().toLowerCase()

export async function listenerSample(db: Firestore, s: { listeners: number; label: string; isShow: boolean; occId: string }, now = Date.now()) {
  const slot = Math.floor(now / 300_000) // one sample per 5 minutes
  await db.collection('listenerSamples').doc(String(slot)).set({
    t: Timestamp.fromMillis(now), listeners: s.listeners, label: s.label, isShow: s.isShow, occId: s.occId,
  })
}

let cache: { at: number; tz: string; v: LabelStats[] } | null = null

export async function tasteStats(db: Firestore, now = Date.now(), tz = 'America/New_York'): Promise<LabelStats[]> {
  if (cache && cache.tz === tz && now - cache.at < 10 * 60_000) return cache.v
  const since = Timestamp.fromMillis(now - DAYS * 86_400_000)
  const [samples, songs, blocks, reacts] = await Promise.all([
    db.collection('listenerSamples').where('t', '>', since).get(),
    db.collection('songRatings').where('at', '>', since).get(),
    db.collection('ratings').where('at', '>', since).get(),
    db.collection('reactions').where('updatedAt', '>', since).get(),
  ])
  type DP = Record<Daypart, { n: number; l: number }>
  const emptyDp = (): DP => ({ morning: { n: 0, l: 0 }, afternoon: { n: 0, l: 0 }, evening: { n: 0, l: 0 }, night: { n: 0, l: 0 } })
  const gdp = emptyDp()
  const m = new Map<string, LabelStats & { _l: number; _ss: number; _bs: number; _rx: number; _rxL: number; _dp: DP }>()
  const get = (label: string) => {
    const k = key(label)
    let x = m.get(k)
    if (!x) { x = { label, listeners: 0, samples: 0, songStars: 0, songRatings: 0, blockStars: 0, blockRatings: 0, reactions: 0, weight: 1, parts: { morning: 1, afternoon: 1, evening: 1, night: 1 }, _dp: emptyDp(), _l: 0, _ss: 0, _bs: 0, _rx: 0, _rxL: 0 }; m.set(k, x) }
    return x
  }
  for (const d of samples.docs) { const l = String(d.get('label') ?? ''); if (!l) continue; const x = get(l); const n = Number(d.get('listeners')) || 0; x.samples++; x._l += n
    const p = daypartOf((d.get('t') as Timestamp).toMillis(), tz); x._dp[p].n++; x._dp[p].l += n; gdp[p].n++; gdp[p].l += n }
  for (const d of songs.docs) { const l = String(d.get('label') ?? ''); if (!l) continue; const x = get(l); x.songRatings++; x._ss += Number(d.get('stars')) || 0 }
  for (const d of blocks.docs) { const l = String(d.get('showTitle') ?? ''); if (!l) continue; const x = get(l); x.blockRatings++; x._bs += Number(d.get('stars')) || 0 }
  const lsn = new Map<string, number>() // avg listeners by label, to turn reaction counts into "per listener"
  for (const x of m.values()) lsn.set(key(x.label), x.samples ? x._l / x.samples : 0)
  for (const d of reacts.docs) {
    const l = String(d.get('showTitle') ?? ''); if (!l) continue
    const c = (d.get('counts') ?? {}) as Record<string, number>
    const x = get(l)
    x._rx += Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0)
    x._rxL += 1
  }
  const all = [...m.values()]
  for (const x of all) {
    x.listeners = x.samples ? x._l / x.samples : 0
    x.songStars = x.songRatings ? x._ss / x.songRatings : 0
    x.blockStars = x.blockRatings ? x._bs / x.blockRatings : 0
    x.reactions = x._rxL ? x._rx / x._rxL : 0
  }
  const avg = (f: (x: LabelStats) => number, n: (x: LabelStats) => number) => {
    const tot = all.reduce((a, x) => a + f(x) * n(x), 0), cnt = all.reduce((a, x) => a + n(x), 0)
    return cnt ? tot / cnt : 0
  }
  const g = {
    l: avg(x => x.listeners, x => x.samples), s: avg(x => x.songStars, x => x.songRatings),
    b: avg(x => x.blockStars, x => x.blockRatings), r: avg(x => x.reactions, () => 1),
  }
  // relative = shrunk value / station average (1 = average). Signals with no station data are skipped.
  const rel = (v: number, n: number, avgV: number) => (avgV > 0 ? ((v * n + avgV * K) / (n + K)) / avgV : 1)
  for (const x of all) {
    const parts = [
      { w: 0.4, r: rel(x.listeners, x.samples, g.l) },
      { w: 0.25, r: rel(x.songStars, x.songRatings, g.s) },
      { w: 0.2, r: rel(x.blockStars, x.blockRatings, g.b) },
      { w: 0.15, r: rel(x.reactions, x._rxL, g.r) },
    ]
    const ws = parts.reduce((a, p) => a + p.w, 0)
    x.weight = Math.min(2, Math.max(0.4, parts.reduce((a, p) => a + p.w * p.r, 0) / ws))
    // By time of day: how well this label does with listeners at that hour, compared with everything else at that hour.
    for (const { id } of DAYPARTS) {
      const d = x._dp[id], gAvg = gdp[id].n ? gdp[id].l / gdp[id].n : 0
      const relDp = gAvg > 0 ? rel(d.n ? d.l / d.n : 0, d.n, gAvg) : 1
      x.parts[id] = Math.round(Math.min(2, Math.max(0.4, 0.5 * x.weight + 0.5 * relDp)) * 100) / 100
    }
  }
  const v = all.map(x => ({ label: x.label, listeners: x.listeners, samples: x.samples, songStars: x.songStars, songRatings: x.songRatings, blockStars: x.blockStars, blockRatings: x.blockRatings, reactions: x.reactions, weight: x.weight, parts: x.parts })).sort((a, b) => b.weight - a.weight)
  cache = { at: now, tz, v }
  return v
}

/** label (lowercase) → weight, for the auto-scheduler. */
export async function genreWeights(db: Firestore, tz?: string): Promise<{ overall: Record<string, number>; parts: Record<string, Partial<Record<Daypart, number>>> }> {
  try {
    const st = await tasteStats(db, Date.now(), tz)
    return { overall: Object.fromEntries(st.map(x => [key(x.label), x.weight])), parts: Object.fromEntries(st.map(x => [key(x.label), x.parts])) }
  } catch { return { overall: {}, parts: {} } }
}
