'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet, apiGetPublic } from '@/lib/auth'
import {
  REFRESH_MS, SECTIONS, dueFor, mergeMe, newerShared, sectionsForRefresh,
  type BundleReply, type MeBundle, type Section, type SharedBundle,
} from '@/lib/liveBundle'
import { LIVE_STATE_DOC, applyPushed, wantsPush, type LiveState } from '@/lib/liveState'

// One place that holds the live page's data (see app/api/live/bundle/route.ts), so the player, skip button, vote card, reactions, set list,
// ratings and the nav all share it instead of one call each. Nothing here polls on a short timer:
//   shared   fetched without a sign-in header (Vercel's edge answers from cache): on page load, once per show, and about every 12 minutes
//   me       your own data: on page load, once per show, and about every 12 minutes. While audio plays it arrives with the listening check-in
//            instead (lib/listenGuard.ts hands it over through ingestMe), so playing adds no calls of its own
//   pushed   the skip tally, vote tally and set list come from one Firestore document (liveState/current) the server keeps up to date. A page
//            listens to it only while its tab is visible and it shows a skip button, vote card or set list.
// Slow-changing sections (host access, reactions palette, your star rating) are asked once per page load and once per show, never on a timer.
// A tab that comes back to the front refreshes at once, unless it refreshed in the last 2 minutes. Hidden tabs ask for nothing.

export interface LiveSnap { shared: SharedBundle | null; me: MeBundle | null; version: number }
const EMPTY: LiveSnap = { shared: null, me: null, version: 0 }
let snap: LiveSnap = EMPTY
let fetched: SharedBundle | null = null
let pushed: LiveState | null = null
const listeners = new Set<() => void>()
/** `bump` = false changes what is shown without ending optimistic overlays (your own just-made change). */
const emit = (patch: Partial<LiveSnap>, bump = true) => { snap = { ...snap, ...patch, version: bump ? snap.version + 1 : snap.version }; listeners.forEach(l => l()) }
const emitShared = () => emit({ shared: applyPushed(fetched, pushed) })

interface Need { shared: boolean; sections: Set<Section> }
const subs = new Map<symbol, Need>()
let uid = ''
let occId = ''
let sharedAt = 0, meAt = 0
let slowKey = '' // `${uid}|${occId}` once the slow sections have been asked for
let busyShared = false, busyMe = false
let listening = false
let refreshMs = REFRESH_MS
let pushFailed = false
let timer: ReturnType<typeof setInterval> | null = null
let unsubPush: Unsubscribe | null = null

const wantsShared = () => [...subs.values()].some(n => n.shared)
const sectionsNeeded = (): Section[] => SECTIONS.filter(s => [...subs.values()].some(n => n.sections.has(s)))
const needsPush = () => [...subs.values()].filter(n => n.sections.has('skip') || n.sections.has('vote') || n.sections.has('setlist')).length
const occParam = () => (occId ? `&occId=${encodeURIComponent(occId)}` : '')
const keyNow = () => `${uid}|${occId}`

/** The part everyone shares. `fresh` skips the edge copy (used once right after you rate a show, so you see your own star in the average). */
export async function refreshShared(fresh = false) {
  if (busyShared) return
  busyShared = true
  try {
    const r = await apiGetPublic<BundleReply>(`/api/live/bundle?part=shared${occParam()}${fresh ? `&t=${Date.now()}` : ''}`)
    if (r.shared) { sharedAt = Date.now(); fetched = newerShared(fetched, r.shared); emitShared() }
  } catch { /* keep what is on screen; the next round tries again */ }
  finally { busyShared = false }
}

/** The sections to ask for now (all of them on a first load or a new show, otherwise without the slow-changing ones). */
export function meSections(): Section[] { return sectionsForRefresh(sectionsNeeded(), { first: slowKey !== keyNow() }) }

/** What the listening check-in should ask for: the same list, plus the show being rated. */
export function meRequest() { return { sections: meSections().join(','), occId } }

/** The personal half arrived with the listening check-in. */
export function ingestMe(me: MeBundle, asked: string) {
  meAt = Date.now()
  if (asked.split(',').some(s => s === 'emojis' || s === 'host' || s === 'rating')) slowKey = keyNow()
  emit({ me: mergeMe(snap.me, me) })
}

/** Your own data on its own (used when nothing is playing). */
export async function refreshMe() {
  const want = meSections()
  if (busyMe || !uid || !want.length) return
  busyMe = true
  try {
    const r = await apiGet<BundleReply>(`/api/live/bundle?part=me&sections=${want.join(',')}${occParam()}`)
    if (r.me) { meAt = Date.now(); if (want.some(s => s === 'emojis' || s === 'host' || s === 'rating')) slowKey = keyNow(); emit({ me: mergeMe(snap.me, r.me) }) }
  } catch { /* keep what is on screen */ }
  finally { busyMe = false }
}

/**
 * Show your own just-made change in `me` (you voted, skipped, upvoted, rated) without waiting for anything. The tallies reach everyone through
 * the pushed document. Does not end optimistic overlays, so nothing flickers.
 */
export function noteMine(patch: Partial<MeBundle>) { emit({ me: { ...(snap.me ?? { at: Date.now() }), ...patch } }, false) }

/** The listening guard says whether audio is playing (then the check-in carries the personal data) and the interval the server asked for. */
export function setListening(on: boolean, intervalMs?: number) {
  listening = on
  if (intervalMs && intervalMs >= 60_000) refreshMs = intervalMs
}

function tick(resumed = false) {
  if (typeof document === 'undefined' || !subs.size) return
  const hidden = document.hidden
  const now = Date.now()
  const everyShared = pushFailed && needsPush() ? 60_000 : refreshMs // if the pushed document cannot be read, fall back to the (edge cached) copy each minute
  if (wantsShared() && dueFor(now - sharedAt, everyShared, { hidden, resumed })) void refreshShared()
  const meFresh = listening && now - meAt < 2 * refreshMs // while playing, the check-in brings it
  if (uid && sectionsNeeded().length && !meFresh && dueFor(now - meAt, refreshMs, { hidden, resumed })) void refreshMe()
}
const onVisible = () => { syncPush(); if (!document.hidden) tick(true) }

// ── the pushed document ──
function syncPush() {
  if (typeof document === 'undefined') return
  const want = wantsPush({ visible: !document.hidden, signedIn: !!uid, subscribers: needsPush() })
  if (want && !unsubPush) {
    try {
      unsubPush = onSnapshot(doc(db, LIVE_STATE_DOC.collection, LIVE_STATE_DOC.id), s => {
        const d = s.data() as LiveState | undefined
        if (d && d.v === 1) { pushed = d; pushFailed = false; emitShared() }
      }, () => { pushFailed = true; detachPush() })
    } catch { pushFailed = true }
  } else if (!want && unsubPush) detachPush()
}
function detachPush() { if (unsubPush) { unsubPush(); unsubPush = null } }

function start() {
  if (timer) return
  timer = setInterval(() => tick(), 30_000) // only decides whether a refresh is due: it asks the server for nothing unless it is
  document.addEventListener('visibilitychange', onVisible)
}
function stop() {
  if (timer) { clearInterval(timer); timer = null }
  document.removeEventListener('visibilitychange', onVisible)
  detachPush()
}

function setUid(next: string) {
  if (next === uid) return
  uid = next
  meAt = 0; slowKey = ''
  if (snap.me) emit({ me: null })
  if (subs.size) { void refreshMe(); syncPush() }
}
function setOcc(next: string) {
  if (next === occId) return
  occId = next
  if (!subs.size) return
  if (wantsShared()) void refreshShared() // once per show: the show's average rating
  void refreshMe() // once per show: your own rating, the reactions palette, host access
}
/** A part joined: fetch now if it needs something that has not been fetched yet. */
function ensure() {
  if (wantsShared() && !sharedAt) void refreshShared()
  if (uid && sectionsNeeded().length && (!meAt || slowKey !== keyNow())) { if (!busyMe && !listening) void refreshMe() }
  syncPush()
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getSnap = () => snap
const getServer = () => EMPTY

export interface LiveNeed { shared?: boolean; sections?: Section[]; occId?: string }

/**
 * Read the live page's data. Say what this part needs (`shared`, and which `sections` of your own data) so nothing is fetched that
 * nobody shows: the nav, for instance, only needs `sections: ['host']` and asks for nothing shared.
 */
export function useLiveBundle(need: LiveNeed = {}): LiveSnap {
  const { user } = useAuth()
  const id = useRef<symbol>(Symbol('live'))
  const shared = need.shared !== false
  const key = (need.sections ?? []).join(',')
  const occ = need.occId

  useEffect(() => { setUid(user?.uid ?? '') }, [user?.uid])
  useEffect(() => {
    if (occ !== undefined) setOcc(occ)
  }, [occ])
  useEffect(() => {
    const me = id.current
    subs.set(me, { shared, sections: new Set(key ? (key.split(',') as Section[]) : []) })
    start()
    ensure()
    return () => { subs.delete(me); if (!subs.size) stop(); else syncPush() }
  }, [shared, key])

  return useSyncExternalStore(subscribe, getSnap, getServer)
}

/**
 * Show your own change at once (a tapped star, a vote) until fresh data arrives: the value lasts only while the data has not
 * been refreshed since it was set. `version` is the snapshot's version.
 */
export function useOverlay<T>(base: T, version: number): [T, (v: T | null) => void] {
  const [o, setO] = useState<{ v: T; version: number } | null>(null)
  const ver = useRef(version)
  useEffect(() => { ver.current = version }, [version])
  return [o && o.version === version ? o.v : base, v => setO(v === null ? null : { v, version: ver.current })]
}
