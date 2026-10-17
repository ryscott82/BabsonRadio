import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { loadConfig } from './autoschedule'

// Keeps the schedule honest. When AzuraCast is playing a different playlist than the auto-scheduler planned
// (or nothing was planned), we record what is really playing in `autoActual`, and the schedule feed shows that
// instead. We assume it keeps playing for 15 minutes past the last time we saw it. When the planned playlist
// comes back, the record is cut off at the moment the first song of it started, so the past stays accurate.

const ASSUME_MS = 15 * 60_000
const EVERY_MS = 20_000
let last = 0

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const ms = (t: unknown) => (t as Timestamp).toMillis()

/** Playlists that only slip station IDs, jingles and promos between songs. They never count as "what is playing". */
export const INTERSTITIAL = /babson sound|station id|\bids?\b|jingle|promo|sweeper|imaging|liner|announce/i
export const isInterstitial = (name: string) => INTERSTITIAL.test(name)

export interface ActualInput { playlist: string; playedAt: number; isLive: boolean; isShow: boolean }

export async function trackActual(db: Firestore, inp: ActualInput, now = Date.now()): Promise<void> {
  if (now - last < EVERY_MS) return
  last = now
  const cfg = await loadConfig(db)

  // The planned auto block covering right now, if any.
  const blocks = await db.collection('autoBlocks').where('endAt', '>', Timestamp.fromMillis(now)).orderBy('endAt').limit(4).get()
  const block = blocks.docs.find(d => ms(d.get('startAt')) <= now)
  const blockStart = block ? ms(block.get('startAt')) : 0
  const blockEnd = block ? ms(block.get('endAt')) : 0
  const planned = block ? String(block.get('label') ?? '') : ''

  // The newest record that is still running or just ended.
  const recent = await db.collection('autoActual').where('endAt', '>', Timestamp.fromMillis(now - 30 * 60_000)).orderBy('endAt', 'desc').limit(3).get()
  const open = recent.docs.find(d => ms(d.get('startAt')) <= now)

  // Live shows and booked shows own the schedule: stop any record that is still running.
  if (inp.isLive || inp.isShow || !inp.playlist) {
    if (open && ms(open.get('endAt')) > now) await open.ref.update({ endAt: Timestamp.fromMillis(now) })
    return
  }

  // A jingle between two songs isn't a change of playlist; ignoring it keeps one steady record instead of dozens.
  if (isInterstitial(inp.playlist)) return

  const target = planned ? (cfg.playlistMap[planned] || planned) : ''
  const matches = !!planned && (norm(planned) === norm(inp.playlist) || norm(target) === norm(inp.playlist))
  const songStart = inp.playedAt > 0 ? inp.playedAt * 1000 : now

  if (matches) {
    // Back on plan: the wrong playlist ended when this song began.
    if (open && ms(open.get('endAt')) > songStart) {
      const end = Math.max(ms(open.get('startAt')), songStart)
      if (end <= ms(open.get('startAt'))) await open.ref.delete()
      else await open.ref.update({ endAt: Timestamp.fromMillis(end) })
    }
    return
  }

  // Something else is playing. Show it under the schedule's own name for that playlist when there is one.
  const genre = Object.entries(cfg.playlistMap).find(([, p]) => norm(p) === norm(inp.playlist))?.[0]
  const label = genre || inp.playlist
  const end = Math.max(now, Math.min(now + ASSUME_MS, blockEnd || Infinity))

  if (open && norm(String(open.get('playlist'))) === norm(inp.playlist) && ms(open.get('endAt')) > now - 2 * 60_000) {
    await open.ref.update({ endAt: Timestamp.fromMillis(end) })
    return
  }

  // A new record, starting when this song started (not before the planned block began).
  let start = Math.max(songStart, blockStart || 0)
  if (open && ms(open.get('endAt')) > start) {
    // The previous record was a different playlist: it ends where this one starts.
    const cut = Math.max(ms(open.get('startAt')), start)
    if (cut <= ms(open.get('startAt'))) await open.ref.delete()
    else await open.ref.update({ endAt: Timestamp.fromMillis(cut) })
    start = Math.max(start, cut)
  }
  await db.collection('autoActual').doc(String(start)).set({
    startAt: Timestamp.fromMillis(start), endAt: Timestamp.fromMillis(Math.max(end, start + 60_000)),
    label, playlist: inp.playlist, planned, createdAt: Timestamp.fromMillis(now),
  })
}
