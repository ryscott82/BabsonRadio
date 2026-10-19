import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { clipInterval } from '../autoschedule'
import { loadConfig } from './autoschedule'
import { syncToAzuraCast } from './azuracast'
import { buildScheduleFeed } from './scheduleFeed'

/** Used when there is not enough listening history for that hour yet. */
export const FALLBACK_THRESHOLD = 15
/** Never fewer than this, so one or two people can't steer the station. */
const MIN_THRESHOLD = 3
const MIN_SAMPLES = 6
const HOUR = 3600_000

/** Voting for an hour closes this long before it starts, so the schedule (and AzuraCast) can be set in time. */
export const LOCK_BEFORE_MS = 60_000
/** A genre needs at least this many votes to take an hour over, however quiet the station is. */
export const MIN_VOTES = 3

/** The hour people are voting for: the next full hour, or the one after once voting for the next hour has closed. */
export const targetBlock = (now = Date.now()) => {
  const next = (Math.floor(now / HOUR) + 1) * HOUR
  return now >= next - LOCK_BEFORE_MS ? next + HOUR : next
}

/**
 * Votes needed to take over an hour: a majority (half) of the people who usually listen at that time.
 * "Usually" = the average of the 5-minute listener samples taken at the same hour of the day over the last 4 weeks
 * (same weekday if there is enough data, otherwise any day). Worked out once per hour block and then stored.
 */
export async function thresholdFor(db: Firestore, blockMs: number): Promise<number> {
  const ref = db.collection('voteThresholds').doc(String(blockMs))
  const saved = await ref.get()
  if (saved.exists) return Number(saved.get('value'))
  const cfg = await loadConfig(db)
  const key = (ms: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms))
    return { h: p.find(x => x.type === 'hour')?.value, d: p.find(x => x.type === 'weekday')?.value }
  }
  const want = key(blockMs + 60_000)
  const snap = await db.collection('listenerSamples').where('t', '>', Timestamp.fromMillis(blockMs - 28 * 24 * HOUR)).get()
  const same = snap.docs.map(d => ({ k: key(d.get('t').toMillis()), n: Number(d.get('listeners')) || 0 })).filter(x => x.k.h === want.h)
  const sameDay = same.filter(x => x.k.d === want.d)
  const use = sameDay.length >= MIN_SAMPLES ? sameDay : same
  const avg = use.length >= MIN_SAMPLES ? use.reduce((a, x) => a + x.n, 0) / use.length : 0
  const value = avg > 0 ? Math.max(MIN_THRESHOLD, Math.ceil(avg / 2)) : FALLBACK_THRESHOLD
  await ref.set({ value, avgListeners: Math.round(avg * 10) / 10, samples: use.length, at: Timestamp.now() })
  return value
}

/**
 * The broad genres listeners can vote on. Keep these general: each one needs a playlist in AzuraCast with the same name
 * (or an entry in the auto-scheduler's playlist map). Staff can replace the list by saving { list: [...] } to the
 * Firestore document config/voteGenres; until then this is used.
 */
export const DEFAULT_VOTE_GENRES = [
  'Pop Hits', 'Hip-Hop & R&B', 'Indie & Alt', 'Throwback Hits',
  'Dance Mix', 'Acoustic', 'Lofi Beats', 'Jazz House for Studying',
]
/** How many choices each hour shows, so votes bunch up instead of spreading thin. */
export const OPTIONS_PER_HOUR = 5

function seeded(n: number) { // small deterministic PRNG so everyone sees the same five for a given hour
  let x = Math.floor(n) | 0
  return () => { x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15; return (x >>> 0) / 4294967296 }
}

/** The five genres on offer for this hour: the same for every listener, different from hour to hour. */
export async function voteOptions(db: Firestore, blockMs: number): Promise<string[]> {
  const saved = (await db.collection('config').doc('voteGenres').get()).get('list')
  const pool = (Array.isArray(saved) && saved.length ? saved.map(String) : DEFAULT_VOTE_GENRES).filter((v, i, a) => v && a.indexOf(v) === i && !/ [-–—] /.test(v)) // genres only: never "Artist - Song" (listeners must not pick specific recordings, see the DMCA note in FEATURES.md)
  if (pool.length <= OPTIONS_PER_HOUR) return pool
  const rnd = seeded(blockMs / HOUR)
  const out = [...pool]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out.slice(0, OPTIONS_PER_HOUR)
}

export interface VoteState {
  blockStart: number
  blockEnd: number
  threshold: number
  options: { label: string; count: number }[]
  myVote: string | null
  winner: string | null   // always null while voting is open (kept so older app versions still decode it)
  /** The hour that has just closed and is coming up next, and who won it ('' = the auto DJ keeps it). */
  upNext: { blockStart: number; label: string } | null
}

export async function voteState(db: Firestore, uid: string | null, now = Date.now()): Promise<VoteState> {
  await finalizeDue(db, now).catch(e => console.error('[vote finalize]', e))
  const blockStart = targetBlock(now)
  const closed = blockStart - HOUR // the hour whose voting just closed (still in the future when now is inside the lock window)
  const [opts, snap, res] = await Promise.all([
    voteOptions(db, blockStart),
    db.collection('songVotes').where('blockMs', '==', blockStart).get(),
    closed > now ? db.collection('voteResults').doc(String(closed)).get() : Promise.resolve(null),
  ])
  const counts = new Map<string, number>()
  let mine: string | null = null
  for (const d of snap.docs) {
    const g = String(d.get('genre'))
    counts.set(g, (counts.get(g) ?? 0) + 1)
    if (uid && d.get('uid') === uid) mine = g
  }
  return {
    blockStart, blockEnd: blockStart + HOUR, threshold: MIN_VOTES,
    options: opts.map(label => ({ label, count: counts.get(label) ?? 0 })),
    myVote: mine,
    winner: null,
    upNext: res?.exists ? { blockStart: closed, label: String(res.get('label') ?? '') } : null,
  }
}

/** Cast or change a vote. Nothing happens to the schedule yet: the hour is decided when voting closes (see finalizeDue). */
export async function castVote(db: Firestore, uid: string, genre: string, now = Date.now()): Promise<VoteState> {
  const blockMs = targetBlock(now)
  const opts = await voteOptions(db, blockMs)
  if (!opts.includes(genre)) throw Object.assign(new Error('Pick one of the options.'), { status: 400 })
  await db.collection('songVotes').doc(`${blockMs}_${uid}`).set({ blockMs, uid, genre, at: Timestamp.fromMillis(now) })
  return voteState(db, uid, now)
}

/**
 * Decide the next hour once its voting has closed. Safe to call as often as you like: the first call writes
 * voteResults/{hour} and applies the result, later calls do nothing.
 * The rule: the genre with the MOST votes wins, if it has at least MIN_VOTES and is strictly ahead of every other genre.
 * A tie, or too few votes, leaves the auto-scheduler's choice alone. Because it is decided once, at the end, nobody can
 * lock in an hour early and the result never flips back and forth.
 */
export async function finalizeDue(db: Firestore, now = Date.now()): Promise<void> {
  const hour = (Math.floor(now / HOUR) + 1) * HOUR
  if (now < hour - LOCK_BEFORE_MS) return
  const ref = db.collection('voteResults').doc(String(hour))
  if ((await ref.get()).exists) return
  const [opts, snap] = await Promise.all([voteOptions(db, hour), db.collection('songVotes').where('blockMs', '==', hour).get()])
  const counts = new Map<string, number>(opts.map(o => [o, 0]))
  for (const d of snap.docs) { const g = String(d.get('genre')); if (counts.has(g)) counts.set(g, (counts.get(g) ?? 0) + 1) }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const [topLabel, topN] = ranked[0] ?? ['', 0]
  const winner = topN >= MIN_VOTES && topN > (ranked[1]?.[1] ?? 0) ? topLabel : ''
  const claimed = await db.runTransaction(async tx => {
    if ((await tx.get(ref)).exists) return false
    tx.set(ref, { label: winner, counts: Object.fromEntries(counts), total: snap.size, at: Timestamp.fromMillis(now) })
    return true
  })
  if (claimed && winner) await applyOverride(db, hour, winner, now)
}

/**
 * Put `label` on the air for [blockMs, blockMs + 1h), replacing whatever the auto-scheduler had there.
 * Booked shows and events stay untouched. The rest of a longer auto block is kept on either side.
 * Blocks with ruleId "vote" are never dropped by the scheduler's rebuild.
 */
async function applyOverride(db: Firestore, blockMs: number, label: string, now: number) {
  const end = blockMs + HOUR
  const cfg = await loadConfig(db)
  const real = (await buildScheduleFeed(db, { days: 2, showStudentHosts: false, now, includeAuto: false }))
    .map(i => ({ startMs: i.startAt, endMs: i.endAt }))
  const overlapping = await db.collection('autoBlocks').where('endAt', '>', Timestamp.fromMillis(blockMs)).get()
  const batch = db.batch()
  const put = (s: number, e: number, lbl: string, ruleId: string) =>
    batch.set(db.collection('autoBlocks').doc(String(s)), {
      startAt: Timestamp.fromMillis(s), endAt: Timestamp.fromMillis(e), label: lbl, ruleId, generated: true, createdAt: Timestamp.fromMillis(now),
    })
  for (const d of overlapping.docs) {
    const s = d.get('startAt').toMillis() as number, e = d.get('endAt').toMillis() as number
    if (s >= end) continue
    batch.delete(d.ref)
    // keep the parts of the old block outside the voted hour
    if (s < blockMs) put(s, blockMs, d.get('label'), d.get('ruleId') ?? '')
    if (e > end) put(end, e, d.get('label'), d.get('ruleId') ?? '')
  }
  for (const p of clipInterval({ startMs: blockMs, endMs: end }, real, 5 * 60_000)) put(p.startMs, p.endMs, label, 'vote')
  await batch.commit()
  if (cfg.syncToAzuraCast) await syncToAzuraCast(db, cfg, now).catch(e => console.error('[vote sync failed]', e))
}
