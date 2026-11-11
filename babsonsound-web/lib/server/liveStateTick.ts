import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { buildShared } from './liveBundle'
import { publishLiveState } from './liveState'
import { targetBlock } from './votes'
import type { NowPlayingInfo } from './nowplaying'

// Two ways the pushed document gets its changes: right after someone acts (publishNow), and when the song, show or voting hour changes
// (liveStateTick, called from the now-playing route, which edge caching already limits to one run every few seconds).

export async function publishNow(db: Firestore, now = Date.now()) {
  const s = await buildShared(db, '', now)
  return publishLiveState(db, s, () => buildShared(db, '', Date.now()), now)
}

let tickKey = ''
export const tickKeyOf = (np: Pick<NowPlayingInfo, 'playedAt' | 'artist' | 'title' | 'isShow' | 'isLive' | 'occId'>, now: number) =>
  [np.playedAt || `${np.artist}|${np.title}`, np.isShow ? 1 : 0, np.isLive ? 1 : 0, np.occId ?? '', targetBlock(now)].join('~')

/** Cheap: compares one string. Only when the song, show or voting hour changed does it build and publish. */
export async function liveStateTick(db: Firestore, np: Parameters<typeof tickKeyOf>[0], now = Date.now()) {
  const key = tickKeyOf(np, now)
  if (key === tickKey) return
  tickKey = key
  await publishNow(db, now).catch(e => { tickKey = ''; console.error('[live state tick]', e) })
}
