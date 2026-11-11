// The small shared document the web page listens to (Firestore liveState/current), so tallies are pushed instead of polled. Pure.
//
// It holds only what changes on a vote, a skip, a new song or a new set list: never the listener count or anything that moves by itself.
// The server writes it at most once every LIVE_STATE_MIN_GAP_MS and only when the content really changed (lib/server/liveState.ts).
import type { SharedBundle } from './liveBundle'

export const LIVE_STATE_DOC = { collection: 'liveState', id: 'current' } as const
export const LIVE_STATE_MIN_GAP_MS = 45_000

export interface LiveState {
  v: 1
  at: number
  skip: SharedBundle['skip']
  vote: SharedBundle['vote']
  setlist: SharedBundle['setlist']
}

/** The pushed part of a shared bundle. */
export const liveStateOf = (s: SharedBundle): LiveState => ({ v: 1, at: s.at, skip: s.skip, vote: s.vote, setlist: s.setlist })

/** Same content = same hash (`at` does not count), so an unchanged state is never written again. */
export const stateHash = (s: Pick<LiveState, 'skip' | 'vote' | 'setlist'>): string => JSON.stringify([s.skip, s.vote, s.setlist])

export type PublishDecision = 'same' | 'write' | 'wait'
/**
 * Should this state be written now? `last` is what this server instance wrote most recently.
 * 'same' = nothing changed; 'wait' = changed but written too recently (try again later); 'write' = go.
 */
export function publishDecision(hash: string, last: { hash: string; at: number } | null, now: number, minGap = LIVE_STATE_MIN_GAP_MS): PublishDecision {
  if (last && last.hash === hash) return 'same'
  if (last && now - last.at < minGap) return 'wait'
  return 'write'
}

/** Pushed tallies go on top of what was fetched (the listener count and the show rating stay as fetched). The newer `at` wins. */
export function applyPushed(shared: SharedBundle | null, p: LiveState | null): SharedBundle | null {
  if (!p) return shared
  if (!shared) return null
  if (p.at < shared.at) return shared
  return { ...shared, at: p.at, skip: p.skip, vote: p.vote, setlist: p.setlist }
}

/** Is it worth holding a listener on the document? Only a visible tab that shows a skip button, vote card or set list. */
export const wantsPush = (o: { visible: boolean; signedIn: boolean; subscribers: number }) => o.visible && o.signedIn && o.subscribers > 0

/** Rough Firestore reads for the pushed document: every attached listener reads once per change, plus once when it attaches. */
export function estimateReads(o: { listeners: number; changesPerHour: number; hours: number; reattachPerListenerPerHour?: number }): number {
  const per = o.changesPerHour + (o.reattachPerListenerPerHour ?? 1)
  return Math.round(o.listeners * per * o.hours)
}
