'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet, apiGetPublic } from '@/lib/auth'
import {
  PERSONAL_MS, SECTIONS, SHARED_MS, dueFor, newerShared,
  type BundleReply, type MeBundle, type Section, type SharedBundle,
} from '@/lib/liveBundle'

// One place that asks /api/live/bundle for the whole live page (see app/api/live/bundle/route.ts), so the player, skip button, vote
// card, reactions, set list, ratings and the nav all share the same two calls instead of one call each:
//   shared  every 30 s, with no sign-in header, so Vercel's edge answers from cache (it runs no function while the copy is fresh)
//   me      every 2 minutes (and right after you act), only the sections the parts on screen need
// Nothing is asked while the tab is hidden; a tab that comes back refreshes at once (unless it just did).

export interface LiveSnap { shared: SharedBundle | null; me: MeBundle | null; version: number }
const EMPTY: LiveSnap = { shared: null, me: null, version: 0 }
let snap: LiveSnap = EMPTY
const listeners = new Set<() => void>()
const emit = (patch: Partial<LiveSnap>) => { snap = { ...snap, ...patch, version: snap.version + 1 }; listeners.forEach(l => l()) }

interface Need { shared: boolean; sections: Set<Section> }
const subs = new Map<symbol, Need>()
let uid = ''
let occId = ''
let sharedAt = 0, meAt = 0
let meSections = ''
let busyShared = false, busyMe = false
let timer: ReturnType<typeof setInterval> | null = null

const wantsShared = () => [...subs.values()].some(n => n.shared)
const sectionsNeeded = (): Section[] => SECTIONS.filter(s => [...subs.values()].some(n => n.sections.has(s)))
const occParam = () => (occId ? `&occId=${encodeURIComponent(occId)}` : '')

/** The part everyone shares. `fresh` skips the edge copy (used once right after you act, so you see your own change). */
export async function refreshShared(fresh = false) {
  if (busyShared) return
  busyShared = true
  try {
    const r = await apiGetPublic<BundleReply>(`/api/live/bundle?part=shared${occParam()}${fresh ? `&t=${Date.now()}` : ''}`)
    if (r.shared) { sharedAt = Date.now(); emit({ shared: newerShared(snap.shared, r.shared) }) }
  } catch { /* keep what is on screen; the next round tries again */ }
  finally { busyShared = false }
}

/** The part that is about you (never cached). */
export async function refreshMe() {
  const want = sectionsNeeded()
  if (busyMe || !uid || !want.length) return
  busyMe = true
  try {
    const r = await apiGet<BundleReply>(`/api/live/bundle?part=me&sections=${want.join(',')}${occParam()}`)
    if (r.me) { meAt = Date.now(); meSections = want.join(','); emit({ me: r.me }) }
  } catch { /* keep what is on screen */ }
  finally { busyMe = false }
}

/** After you vote, skip, rate or upvote: refresh both halves now. */
export function refreshAfterAction() { void refreshMe(); void refreshShared(true) }

function tick(resumed = false) {
  if (typeof document === 'undefined' || !subs.size) return
  const hidden = document.hidden
  const now = Date.now()
  if (wantsShared() && dueFor(now - sharedAt, SHARED_MS, { hidden, resumed })) void refreshShared()
  if (uid && sectionsNeeded().length && dueFor(now - meAt, PERSONAL_MS, { hidden, resumed })) void refreshMe()
}
const onVisible = () => { if (!document.hidden) tick(true) }

function start() {
  if (timer) return
  timer = setInterval(() => tick(), 5_000)
  document.addEventListener('visibilitychange', onVisible)
}
function stop() {
  if (timer) { clearInterval(timer); timer = null }
  document.removeEventListener('visibilitychange', onVisible)
}

function setUid(next: string) {
  if (next === uid) return
  uid = next
  meAt = 0; meSections = ''
  if (snap.me) emit({ me: null })
  if (subs.size) void refreshMe()
}
function setOcc(next: string) {
  if (next === occId) return
  occId = next
  if (!subs.size) return
  if (wantsShared()) void refreshShared()
  void refreshMe()
}
/** A part joined: fetch now if it needs something that has not been fetched yet. */
function ensure() {
  if (wantsShared() && !sharedAt) void refreshShared()
  const want = sectionsNeeded().join(',')
  if (uid && want && want !== meSections) { if (!busyMe) void refreshMe() }
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
    return () => { subs.delete(me); if (!subs.size) stop() }
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
