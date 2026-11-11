import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { azSkip, azuraConfigured } from './azuracast'
import { getNowPlaying } from './nowplaying'
import { PRESENCE_TTL_MS } from '../liveBundle'

// Skip a song during the auto DJ: any signed-in listener can ask, and when at least 90% of the people listening have,
// the song skips. A vote only counts while that person is still tuned in. Live shows can't be skipped by listeners.

export const SKIP_SHARE = 0.9
const FRESH_MS = PRESENCE_TTL_MS // a listener counts for 18 minutes after their last check-in (they check in every 12)

const LISTEN_TTL = 60_000
let listenCache: { at: number; ids: Promise<Set<string>> } | null = null
/**
 * Who is tuned in right now (shared by the skip vote, the listener count and the friends list). Looked up at most once a minute
 * per server instance, and callers that arrive while a lookup is running share it instead of starting their own.
 */
export function listeningIds(db: Firestore, now: number): Promise<Set<string>> {
  if (listenCache && now - listenCache.at < LISTEN_TTL) return listenCache.ids
  const ids = db.collection('presence').where('updatedAt', '>', Timestamp.fromMillis(now - FRESH_MS)).select('isListening').get()
    .then(snap => new Set(snap.docs.filter(d => d.get('isListening') === true).map(d => d.id)))
  const entry = { at: now, ids }
  listenCache = entry
  ids.catch(() => { if (listenCache === entry) listenCache = null }) // a failed lookup must not stay cached
  return ids
}

// The skip-vote document for the song on air, kept for 5 s per instance (everyone polling reads the same one).
const SKIP_DOC_TTL = 5_000
const skipDocs = new Map<string, { at: number; voters: string[]; skipped: boolean }>()
/** Call right after writing the skip-vote document so this instance reads its own change. */
export const forgetSkipDoc = (key: string) => { skipDocs.delete(key) }
async function skipDoc(db: Firestore, key: string, now: number) {
  const hit = skipDocs.get(key)
  if (hit && now - hit.at < SKIP_DOC_TTL) return hit
  const d = await db.collection('skipVotes').doc(key).get()
  const v = { at: now, voters: (d.get('voters') as string[] | undefined) ?? [], skipped: d.get('skipped') === true }
  if (skipDocs.size > 20) skipDocs.clear()
  skipDocs.set(key, v)
  return v
}

export interface SkipState { eligible: boolean; votes: number; needed: number; listeners: number; mine: boolean; skipped: boolean }

export async function skipState(db: Firestore, uid: string | null, now = Date.now()): Promise<SkipState & { key: string }> {
  const np = await getNowPlaying()
  const eligible = np.configured && !!np.title && !np.isLive && !np.isShow
  const key = String(np.playedAt || `${np.artist}|${np.title}`).replace(/[/\s]/g, '_').slice(0, 120)
  if (!eligible) return { key, eligible: false, votes: 0, needed: 0, listeners: 0, mine: false, skipped: false }
  const [doc, here] = await Promise.all([skipDoc(db, key, now), listeningIds(db, now)])
  const voters = doc.voters.filter(v => here.has(v))
  // Only signed-in listeners can vote, so they are the people who count. AzuraCast's own count also includes people
  // without accounts and second tabs, which made 90% impossible to reach.
  const listeners = Math.max(here.size, 1)
  return {
    key, eligible: true, votes: voters.length, needed: Math.ceil(listeners * SKIP_SHARE), listeners,
    mine: !!uid && doc.voters.includes(uid), skipped: doc.skipped,
  }
}

/** If enough listeners asked, skip the song (once). Safe to call from reads too, so people leaving can tip it. */
export async function applySkipIfReady(db: Firestore, s: SkipState & { key: string }, now = Date.now()): Promise<SkipState & { key: string }> {
  if (!s.eligible || s.skipped || s.votes < s.needed || !azuraConfigured()) return s
  const ref = db.collection('skipVotes').doc(s.key)
  // Mark first so two people tipping it at once only skip one song.
  const won = await db.runTransaction(async tx => {
    if ((await tx.get(ref)).get('skipped') === true) return false
    tx.set(ref, { skipped: true, skippedAt: Timestamp.fromMillis(now), needed: s.needed, votes: s.votes }, { merge: true })
    return true
  })
  forgetSkipDoc(s.key)
  if (!won) return s
  try { await azSkip(); return { ...s, skipped: true } }
  catch (e) {
    console.error('[vote skip]', e)
    await ref.set({ skipped: false }, { merge: true })
    forgetSkipDoc(s.key)
    throw e
  }
}

export { azuraConfigured, azSkip }
