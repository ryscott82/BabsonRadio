import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { Access } from './access'
import { hostShows, occurrenceId } from './host'
import { currentOnAir } from './live'
import { HttpError } from './http'
import { BYPASS_UID, canGoLiveOpenFloor, cleanAdPlan, liveWindowOpen, verifyAttest, type AdPlan } from '../booth'
import { accessOf as accessOfUser } from './access'
import { requireUser } from './http'
import { buildScheduleFeed } from './scheduleFeed'

// Studio PC (booth): who may go live from the studio, and the sign-in log. See tools/studio-helper/README.md.
// Collections (admin SDK only): boothSessions/{id} one per sign-in on the studio PC, boothEvents/{id} what happened in it.

export const boothSecret = () => {
  const s = process.env.STUDIO_PC_SECRET ?? ''
  if (s.length < 24) throw new HttpError(503, 'The studio PC is not set up yet.', 'BR-BTH-004')
  return s
}

export interface BoothShow { title: string; occId: string; startAt: number; endAt: number }
export interface BoothPermit { canGoLive: boolean; reason: string; show: BoothShow | null; nextShow: BoothShow | null }

const asShow = (s: { key: string; title: string; startAt: number; endAt: number }): BoothShow =>
  ({ title: s.title, occId: occurrenceId(s), startAt: s.startAt, endAt: s.endAt })

/**
 * Directors and admins can always go live. Students need an active Radio badge and one of their own shows starting within
 * 30 minutes or still running (until 30 minutes after it ends). `show` is the airing the pinned message is for.
 */
export async function boothPermit(db: Firestore, uid: string, a: Access, now = Date.now(), open: { hostedBefore: boolean; showRunning: boolean } = { hostedBefore: false, showRunning: true }): Promise<BoothPermit> {
  const shows = await hostShows(db, uid, now, 1)
  const mine = shows.find(s => liveWindowOpen(s, now))
  const next = shows.find(s => s.startAt > now)
  const nextShow = next ? asShow(next) : null
  if (a.level === 'admin' || a.level === 'director') {
    let show = mine ? asShow(mine) : null
    if (!show) {
      const cur = await currentOnAir(db, now)
      if (cur?.isShow) show = { title: cur.item.title, occId: cur.occId, startAt: cur.item.startAt, endAt: cur.item.endAt }
    }
    return { canGoLive: true, reason: '', show, nextShow }
  }
  if (!a.radio) {
    return { canGoLive: false, reason: a.radioExpired ? 'Your radio training ran out. Renew it to go live.' : 'Finish radio training to go live.', show: null, nextShow }
  }
  if (!mine && canGoLiveOpenFloor({ radio: a.radio, hostedBefore: open.hostedBefore, showRunning: open.showRunning })) {
    return { canGoLive: true, reason: '', show: null, nextShow }
  }
  if (!mine) {
    return { canGoLive: false, reason: next ? 'You can go live 30 minutes before your show.' : "You don't have a show booked right now.", show: null, nextShow }
  }
  return { canGoLive: true, reason: '', show: asShow(mine), nextShow }
}

export interface SessionInfo { uid: string; name: string; email: string; level: string; canGoLive: boolean }

/** Keep the same sign-in session while the page refreshes its token; start a new one otherwise. */
export async function touchSession(db: Firestore, sessionId: string, info: SessionInfo, now = Date.now()): Promise<string> {
  const col = db.collection('boothSessions')
  if (sessionId) {
    const ref = col.doc(sessionId)
    const d = await ref.get()
    if (d.exists && d.get('uid') === info.uid && !d.get('endedAt')) {
      await ref.update({ lastSeenAt: Timestamp.fromMillis(now), canGoLive: info.canGoLive })
      return sessionId
    }
  }
  const ref = col.doc()
  await ref.set({
    ...info, startedAt: Timestamp.fromMillis(now), lastSeenAt: Timestamp.fromMillis(now),
    liveCount: 0, onAirMs: 0, songCount: 0,
  })
  await logEvent(db, ref.id, info.uid, info.name, 'sign_in', '', now)
  return ref.id
}

export const EVENT_KINDS = ['live_start', 'live_stop', 'song', 'music', 'sign_out', 'idle_out', 'quiet_ack'] as const
/** Logged by other routes, not sent by the page. */
type OtherKind = 'note' | 'crew_join' | 'handoff'
export type EventKind = (typeof EVENT_KINDS)[number] | OtherKind | 'sign_in'

export async function logEvent(db: Firestore, sessionId: string, uid: string, name: string, kind: EventKind, text: string, now = Date.now()) {
  await db.collection('boothEvents').add({ sessionId, uid, name, kind, text, at: Timestamp.fromMillis(now) })
}

/** Record one thing that happened in a session and keep the session's totals up to date. */
export async function recordEvent(db: Firestore, sessionId: string, uid: string, kind: (typeof EVENT_KINDS)[number] | OtherKind, text: string, now = Date.now()) {
  const ref = db.collection('boothSessions').doc(sessionId)
  const name = await db.runTransaction(async tx => {
    const d = await tx.get(ref)
    if (!d.exists || d.get('uid') !== uid) throw new HttpError(404, 'That studio session is over. Sign in again.', 'BR-BTH-003')
    const liveSince = (d.get('liveSince') as Timestamp | undefined)?.toMillis() ?? 0
    const patch: Record<string, unknown> = { lastSeenAt: Timestamp.fromMillis(now) }
    const stopClock = () => { if (liveSince) { patch.onAirMs = FieldValue.increment(Math.max(0, now - liveSince)); patch.liveSince = FieldValue.delete() } }
    if (kind === 'live_start') {
      if (!liveSince) patch.liveSince = Timestamp.fromMillis(now)
      patch.liveCount = FieldValue.increment(1)
      if (!d.get('firstLiveAt')) patch.firstLiveAt = Timestamp.fromMillis(now)
    } else if (kind === 'live_stop') {
      stopClock()
    } else if (kind === 'song') {
      patch.songCount = FieldValue.increment(1)
    } else if (kind === 'music') {
      patch.musicCount = FieldValue.increment(1)
    } else if (kind === 'note' || kind === 'quiet_ack') {
      // nothing to count
    } else {
      stopClock()
      if (!d.get('endedAt')) { patch.endedAt = Timestamp.fromMillis(now); patch.endReason = kind }
    }
    tx.update(ref, patch)
    return String(d.get('name') ?? '')
  })
  await logEvent(db, sessionId, uid, name, kind, text, now)
  // The driver left: the crew is forgotten.
  if (kind === 'sign_out' || kind === 'idle_out') {
    const c = await db.collection('boothCrew').doc('current').get().catch(() => null)
    if (c?.exists && c.get('driverUid') === uid && c.get('sessionId') === sessionId) await c.ref.delete().catch(() => {})
  }
  if (kind === 'live_start' && uid !== BYPASS_UID) await db.collection('users').doc(uid).set({ hostedLive: true }, { merge: true }).catch(() => {})
}

// ── Song typed on the studio PC ─────────────────────────────
// During a live show the site normally shows the show and host names (live streams rarely carry track info). When the host
// types the song on the studio PC it is kept here and shown instead, until they type another, go off air or sign out.
const SONG_MAX_AGE_MS = 3 * 3_600_000

export async function setBoothSong(db: Firestore, sessionId: string, title: string, artist: string, now = Date.now()) {
  await db.collection('boothNowPlaying').doc('current').set({ sessionId, title, artist, at: Timestamp.fromMillis(now) })
}

export async function clearBoothSong(db: Firestore, sessionId: string) {
  const ref = db.collection('boothNowPlaying').doc('current')
  const d = await ref.get()
  if (d.exists && d.get('sessionId') === sessionId) await ref.delete()
}

export async function boothSong(db: Firestore, now = Date.now()): Promise<{ title: string; artist: string } | null> {
  const d = await db.collection('boothNowPlaying').doc('current').get()
  const at = (d.get('at') as Timestamp | undefined)?.toMillis() ?? 0
  if (!d.exists || now - at > SONG_MAX_AGE_MS) return null
  const title = String(d.get('title') ?? ''), artist = String(d.get('artist') ?? '')
  return title ? { title, artist } : null
}

// ── Ad breaks, handoff notes, who is on next ────────────────
export async function adPlan(db: Firestore): Promise<AdPlan> {
  const d = await db.collection('config').doc('booth').get()
  return cleanAdPlan(d.get('ads'))
}

export interface NextOnAir { title: string; hosts: string[]; startAt: number }

/** The next scheduled show (not music blocks) starting after the current one ends, within 12 hours. */
export async function nextOnAir(db: Firestore, after: number, now = Date.now()): Promise<NextOnAir | null> {
  const items = await buildScheduleFeed(db, { days: 1, showStudentHosts: false, now })
  const n = items.filter(i => i.source !== 'auto' && i.startAt >= after - 60_000 && i.startAt < now + 12 * 3_600_000).sort((a, b) => a.startAt - b.startAt)[0]
  return n ? { title: n.title, hosts: n.hosts ?? [], startAt: n.startAt } : null
}

export interface BoothNote { text: string; by: string; at: number }
const NOTE_MAX_AGE_MS = 24 * 3_600_000

/** The last note a host left on the studio PC for whoever comes next (shown for 24 hours). */
export async function latestNote(db: Firestore, now = Date.now()): Promise<BoothNote | null> {
  const s = await db.collection('boothNotes').orderBy('at', 'desc').limit(1).get()
  const d = s.docs[0]
  const at = (d?.get('at') as Timestamp | undefined)?.toMillis() ?? 0
  if (!d || now - at > NOTE_MAX_AGE_MS) return null
  return { text: String(d.get('text') ?? ''), by: String(d.get('byName') ?? ''), at }
}

/** The studio PC page proves itself with the signed nonce it already uses ({ x-booth-nonce, x-booth-sig } headers), or the person is signed in (not a guest). */
export async function requireBoothCaller(req: Request, now = Date.now()): Promise<void> {
  const nonce = req.headers.get('x-booth-nonce') ?? '', sig = req.headers.get('x-booth-sig') ?? ''
  if (nonce && sig && verifyAttest(boothSecret(), nonce.slice(0, 100), sig.slice(0, 100), now)) return
  const t = await requireUser(req)
  if ((await accessOfUser(t)).level === 'guest') throw new HttpError(403, 'This is for Babson, Olin and Wellesley students.', 'BR-PERM-001')
}

/** Has this person gone live from the studio before? Remembered on their user record (users/{uid}.hostedLive); the first time, the old session log is checked once. */
export async function hostedBefore(db: Firestore, uid: string, flag: unknown): Promise<boolean> {
  if (flag === true) return true
  if (flag === false) return false
  const snap = await db.collection('boothSessions').where('uid', '==', uid).limit(50).get()
  const yes = snap.docs.some(d => Number(d.get('liveCount') ?? 0) > 0)
  await db.collection('users').doc(uid).set({ hostedLive: yes }, { merge: true }).catch(() => {})
  return yes
}

/** Is a scheduled show (not Auto DJ) on air now? */
export async function showOnAirNow(db: Firestore, now = Date.now()): Promise<boolean> {
  return !!(await currentOnAir(db, now).catch(() => null))?.isShow
}


// ── Studio crew (lib/crew.ts) ───────────────────────────────
export const crewRef = (db: Firestore) => db.collection('boothCrew').doc('current')
export async function loadCrew(db: Firestore): Promise<import('@/lib/crew').CrewDoc | null> {
  const s = await crewRef(db).get()
  if (!s.exists) return null
  return {
    driverUid: String(s.get('driverUid') ?? ''), driverName: String(s.get('driverName') ?? ''), sessionId: String(s.get('sessionId') ?? ''),
    updatedAt: Number(s.get('updatedAt') ?? 0), members: (s.get('members') ?? {}) as Record<string, import('@/lib/crew').CrewPerson>,
  }
}
