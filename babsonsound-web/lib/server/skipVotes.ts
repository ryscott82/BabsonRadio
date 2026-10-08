import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { azSkip, azuraConfigured } from './azuracast'
import { getNowPlaying } from './nowplaying'

// Skip a song during the auto DJ: any signed-in listener can ask, and when at least 90% of the people listening have,
// the song skips. A vote only counts while that person is still tuned in. Live shows can't be skipped by listeners.

export const SKIP_SHARE = 0.9
const FRESH_MS = 240_000 // same freshness as the presence heartbeat

let listenCache: { at: number; ids: Set<string> } | null = null
async function listeningIds(db: Firestore, now: number): Promise<Set<string>> {
  if (listenCache && now - listenCache.at < 15_000) return listenCache.ids
  const snap = await db.collection('presence').where('updatedAt', '>', Timestamp.fromMillis(now - FRESH_MS)).get()
  const ids = new Set(snap.docs.filter(d => d.get('isListening') === true).map(d => d.id))
  listenCache = { at: now, ids }
  return ids
}

export interface SkipState { eligible: boolean; votes: number; needed: number; listeners: number; mine: boolean; skipped: boolean }

export async function skipState(db: Firestore, uid: string | null, now = Date.now()): Promise<SkipState & { key: string }> {
  const np = await getNowPlaying()
  const eligible = np.configured && !!np.title && !np.isLive && !np.isShow
  const key = String(np.playedAt || `${np.artist}|${np.title}`).replace(/[/\s]/g, '_').slice(0, 120)
  if (!eligible) return { key, eligible: false, votes: 0, needed: 0, listeners: 0, mine: false, skipped: false }
  const [doc, here] = await Promise.all([db.collection('skipVotes').doc(key).get(), listeningIds(db, now)])
  const voters = ((doc.get('voters') as string[] | undefined) ?? []).filter(v => here.has(v))
  // The listener count AzuraCast reports also includes people without accounts, so use whichever is larger.
  const listeners = Math.max(np.listeners, here.size, 1)
  return {
    key, eligible: true, votes: voters.length, needed: Math.ceil(listeners * SKIP_SHARE), listeners,
    mine: !!uid && ((doc.get('voters') as string[] | undefined) ?? []).includes(uid), skipped: doc.get('skipped') === true,
  }
}

export { azuraConfigured, azSkip }
