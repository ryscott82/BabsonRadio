import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { Access } from './access'
import { hostShows, occurrenceId } from './host'
import { currentOnAir } from './live'
import { HttpError } from './http'
import { liveWindowOpen } from '../booth'

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
export async function boothPermit(db: Firestore, uid: string, a: Access, now = Date.now()): Promise<BoothPermit> {
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

export const EVENT_KINDS = ['live_start', 'live_stop', 'song', 'sign_out', 'idle_out'] as const
export type EventKind = (typeof EVENT_KINDS)[number] | 'sign_in'

export async function logEvent(db: Firestore, sessionId: string, uid: string, name: string, kind: EventKind, text: string, now = Date.now()) {
  await db.collection('boothEvents').add({ sessionId, uid, name, kind, text, at: Timestamp.fromMillis(now) })
}

/** Record one thing that happened in a session and keep the session's totals up to date. */
export async function recordEvent(db: Firestore, sessionId: string, uid: string, kind: (typeof EVENT_KINDS)[number], text: string, now = Date.now()) {
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
    } else {
      stopClock()
      if (!d.get('endedAt')) { patch.endedAt = Timestamp.fromMillis(now); patch.endReason = kind }
    }
    tx.update(ref, patch)
    return String(d.get('name') ?? '')
  })
  await logEvent(db, sessionId, uid, name, kind, text, now)
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
