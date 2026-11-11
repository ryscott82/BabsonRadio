import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { MAX_REACTIONS, award, emojisFor } from './earnedEmojis'
import { EMOJIS, currentOnAir, hostPrefsFor, parseSongs, type OnAir } from './live'
import { getNowPlaying } from './nowplaying'
import { hostDayActive, type HostContext } from './host'
import { loadConfig } from './autoschedule'
import { visibleFriendProfiles } from './friends'
import { listeningGroups } from './groups'
import { PRESENCE_TTL_MS } from '../liveBundle'

// Pieces of the live page that more than one route needs. They moved here from the old routes (set list, ratings, reactions, host
// access, presence) so /api/live/bundle and the old routes give the same answers from the same caches.

// ── set list ──
// The set list and its votes are the same for everyone, so they are read at most once every 5 s per server instance per airing
// (and again right away after someone votes on this instance).
const lists = new Map<string, { at: number; songs: string; votes: Record<string, string[]> }>()
export const forgetSetlist = (occId: string) => { lists.delete(occId) }

export interface SetlistData { occId: string; title: string; songs: { id: string; text: string }[]; votes: Record<string, string[]> }
export async function setlistData(db: Firestore, cur: OnAir | null): Promise<SetlistData> {
  if (!cur || !cur.isShow) return { occId: '', title: '', songs: [], votes: {} }
  let hit = lists.get(cur.occId)
  if (!hit || Date.now() - hit.at >= 5_000) {
    const [list, votes] = await Promise.all([
      db.collection('setlists').doc(cur.occId).get(),
      db.collection('setlistVotes').doc(cur.occId).get(),
    ])
    hit = { at: Date.now(), songs: String(list.get('songs') ?? ''), votes: (votes.get('votes') ?? {}) as Record<string, string[]> }
    if (lists.size > 20) lists.clear()
    lists.set(cur.occId, hit)
  }
  return { occId: cur.occId, title: cur.item.title, songs: parseSongs(hit.songs), votes: hit.votes }
}

// ── show ratings ──
// Everyone rating the same show reads the same ratings, so they are fetched at most once every 30 s per server instance per show
// (and again right away after someone rates on this instance). Only the stars and who gave them are kept.
const rated = new Map<string, { at: number; rows: { uid: string; stars: number }[] }>()
export const forgetRatings = (occId: string) => { rated.delete(occId) }
export async function ratingRows(db: Firestore, occId: string, now: number) {
  const hit = rated.get(occId)
  if (hit && now - hit.at < 30_000) return hit.rows
  const snap = await db.collection('ratings').where('occId', '==', occId).select('uid', 'stars').get()
  const rows = snap.docs.map(d => ({ uid: String(d.get('uid')), stars: Number(d.get('stars')) }))
  if (rated.size > 20) rated.clear()
  rated.set(occId, { at: now, rows })
  return rows
}
export function ratingSummary(rows: { stars: number }[]) {
  const stars = rows.map(r => r.stars)
  return { count: stars.length, avg: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : 0 }
}

// ── reactions this person can use ──
/** Keys on the main reaction row. */
export const SLOTS = 5

/** Everything this person can use right now: the host's own set for a show that picked one (otherwise the usual ones), plus what they earned. */
export async function allEmojisFor(db: Firestore, uid: string, userDoc?: { get(f: string): unknown }, onAir?: OnAir | null) {
  const cur = onAir === undefined ? await currentOnAir(db).catch(() => null) : onAir
  const mine = cur ? (await hostPrefsFor(db, cur)).emojis : []
  return (await emojisFor(db, uid, mine.length ? mine : EMOJIS, userDoc)).slice(0, MAX_REACTIONS)
}

//   emojis  everything they can use (the drawer row, and the choices when swapping a key)
//   top     the main row: the keys they chose to hold (reactionSlots), the rest filled with their most used
export async function emojiRow(db: Firestore, uid: string, onAir?: OnAir | null) {
  const d = await db.collection('users').doc(uid).get() // one read of the user doc, shared with the earned-emoji lookup
  const all = await allEmojisFor(db, uid, d, onAir)
  const use = (d.get('emojiUse') ?? {}) as Record<string, number>
  const byUse = [...all].sort((a, b) => (use[b] ?? 0) - (use[a] ?? 0))
  const saved = ((d.get('reactionSlots') as string[] | undefined) ?? []).slice(0, SLOTS)
  const taken = new Set<string>()
  const row: (string | null)[] = saved.map(e => (all.includes(e) && !taken.has(e) ? (taken.add(e), e) : null))
  const fill = byUse.filter(e => !taken.has(e))
  const top = row.map(e => e ?? fill.shift() ?? null).filter((e): e is string => !!e)
  if (!saved.length) top.splice(0, top.length, ...byUse)
  return { emojis: all, top, customized: saved.length > 0 }
}

// ── host access ──
// `hosting` is host mode: today is a day one of their shows is on (the app shows the Host tab).
// `controlsOpen` is narrower: inside the 4-hour window around a show, when the controls actually work.
export async function hostAccess(db: Firestore, c: HostContext, now: number) {
  const tz = (await loadConfig(db)).timezone
  if (c.shows.length > 0) await award(db, c.t.uid, '🎤').catch(() => {})
  return { host: c.staff || c.shows.length > 0, hosting: hostDayActive(c.shows, now, tz), controlsOpen: c.open.length > 0 }
}

// ── presence ──
const FRESH_MS = PRESENCE_TTL_MS // a listener counts for 18 minutes after their last check-in
const YEAR_MS = 366 * 86_400_000

/**
 * Note that this person is (still) listening, or has stopped. The listening log keeps one `listenSessions` record per stretch of
 * listening (who, when, how long, web or iOS, what was on): written when a stretch starts, every ~10 minutes while it goes on,
 * and when it stops. If an app disappears without saying goodbye, the next heartbeat closes the old stretch at its last known time.
 */
export async function recordPresence(db: Firestore, uid: string, listening: boolean, platform: 'ios' | 'web', now = Date.now()) {
  const ref = db.collection('presence').doc(uid)
  const prev = await ref.get()
  const prevAt = (prev.get('updatedAt') as Timestamp | undefined)?.toMillis() ?? 0
  const prevSession = prev.get('sessionId') as string | undefined
  const wasActive = !!prevSession && prev.get('isListening') === true && now - prevAt < FRESH_MS + 60_000
  const sessions = db.collection('listenSessions')
  const seconds = (from: number, to: number) => Math.max(0, Math.round((to - from) / 1000))
  const startOf = (prev.get('sessionStart') as number | undefined) ?? prevAt

  let sessionId = wasActive ? prevSession : undefined
  const sessionStart = wasActive ? startOf : now
  if (prevSession && !wasActive && prev.get('isListening') === true) {
    // The old stretch ended without a goodbye: close it where we last heard from it.
    await sessions.doc(prevSession).set({ end: Timestamp.fromMillis(prevAt), seconds: seconds(startOf, prevAt) }, { merge: true })
  }
  if (listening) {
    if (!sessionId) {
      const np = await getNowPlaying().catch(() => null)
      const doc = sessions.doc()
      sessionId = doc.id
      await doc.set({
        uid, platform, start: Timestamp.fromMillis(now), end: Timestamp.fromMillis(now), seconds: 0,
        label: np?.blockTitle ?? '', occId: np?.occId ?? '', exp: Timestamp.fromMillis(now + YEAR_MS),
      })
    } else if (Math.floor(prevAt / 600_000) !== Math.floor(now / 600_000)) {
      await sessions.doc(sessionId).set({ end: Timestamp.fromMillis(now), seconds: seconds(sessionStart, now) }, { merge: true })
    }
  } else if (wasActive && prevSession) {
    await sessions.doc(prevSession).set({ end: Timestamp.fromMillis(now), seconds: seconds(startOf, now) }, { merge: true })
  }
  await ref.set({
    isListening: listening, updatedAt: Timestamp.fromMillis(now),
    ...(listening && sessionId ? { sessionId, sessionStart } : { sessionId: FieldValue.delete(), sessionStart: FieldValue.delete() }),
  })
}

/** Verified students also see the first names of connected contacts who are tuned in (and not invisible), and the class / year lines. */
export async function presenceFriends(db: Firestore, t: DecodedIdToken, listening: Set<string>) {
  const map = await visibleFriendProfiles(db, t.uid, listening)
  const friends = [...map].filter(([id]) => listening.has(id)).map(([uid, f]) => ({ uid, firstName: f.firstName, ...(f.instagram ? { instagram: f.instagram } : {}) }))
  const groups = await listeningGroups(db, t.uid, listening).catch(() => [])
  return { friends, groups }
}
