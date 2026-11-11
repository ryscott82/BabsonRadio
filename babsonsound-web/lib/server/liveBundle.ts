import 'server-only'
import type { DecodedIdToken } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import { accessOf } from './access'
import { currentOnAir, requestsStatus } from './live'
import { emojiRow, hostAccess, presenceFriends, ratingRows, ratingSummary, setlistData } from './liveData'
import { hostContextFor } from './host'
import { applySkipIfReady, listeningIds, skipState } from './skipVotes'
import { voteState } from './votes'
import { mayRun } from './tierGate'
import type { Feature } from '../cpuTiers'
import { occRateable, type MeBundle, type Section, type SharedBundle } from '../liveBundle'

// What /api/live/bundle sends. Every piece comes from the same caches the old routes used, so the answers match them.

/** The half that is the same for everyone: no sign-in needed, safe to cache at the edge. */
export async function buildShared(db: Firestore, occId: string, now = Date.now()): Promise<SharedBundle> {
  const cur = await currentOnAir(db, now).catch(() => null) // looked up once and shared by the pieces below
  const [listening, skip, vote, rq, list, rows] = await Promise.all([
    listeningIds(db, now),
    skipState(db, null, now).then(async s => { try { return await applySkipIfReady(db, s, now) } catch { return s } }), // if enough people asked, skip now (the vote still stands if it fails)
    voteState(db, null, now),
    requestsStatus(db, now, cur),
    setlistData(db, cur),
    occId && occRateable(occId, now) ? ratingRows(db, occId, now) : Promise.resolve(null),
  ])
  return {
    at: now,
    presence: { count: listening.size },
    skip: { eligible: skip.eligible, votes: skip.votes, needed: skip.needed, skipped: skip.skipped },
    vote: {
      blockStart: vote.blockStart, blockEnd: vote.blockEnd, threshold: vote.threshold, options: vote.options,
      winner: vote.winner, upNext: vote.upNext, requestsOpen: rq.open, requestsShow: rq.showTitle,
    },
    setlist: { occId: list.occId, title: list.title, songs: list.songs.map(s => ({ ...s, votes: list.votes[s.id]?.length ?? 0 })) },
    rating: rows ? { occId, ...ratingSummary(rows) } : null,
  }
}

// `feature` ties a section to a tier (lib/cpuTiers.ts): when the site is short of server time the section is left out like a failed one,
// and the page keeps what it already shows.
async function section<T>(name: string, fn: () => Promise<T>, gate?: { feature: Feature; uid: string }): Promise<T | null> {
  try { if (gate && !(await mayRun(gate.feature, gate.uid))) return null; return await fn() } catch (e) { console.error(`[live bundle] ${name}`, e); return null } // one piece failing must not blank the rest
}

/** The half that depends on who is asking. Only the sections asked for are worked out. Guests get the pieces that apply to them. */
export async function buildMe(db: Firestore, t: DecodedIdToken, want: Section[], occId: string, now = Date.now()): Promise<MeBundle> {
  const has = (s: Section) => want.includes(s)
  const guest = (await accessOf(t)).level === 'guest'
  const needCur = has('setlist') || has('emojis')
  const cur = needCur ? await currentOnAir(db, now).catch(() => null) : null
  const [presence, skip, vote, setlist, rating, emojis, host] = await Promise.all([
    has('presence') ? section('presence', async () => (guest ? { friends: [], groups: [] } : presenceFriends(db, t, await listeningIds(db, now))), { feature: 'presence', uid: t.uid }) : undefined,
    has('skip') ? section('skip', async () => ({ mine: guest ? false : (await skipState(db, t.uid, now)).mine }), { feature: 'skip', uid: t.uid }) : undefined,
    has('vote') ? section('vote', async () => ({ myVote: (await voteState(db, t.uid, now)).myVote, canVote: !guest }), { feature: 'vote', uid: t.uid }) : undefined,
    has('setlist') ? section('setlist', async () => {
      const l = await setlistData(db, cur)
      return { occId: l.occId, mine: l.songs.filter(s => (l.votes[s.id] ?? []).includes(t.uid)).map(s => s.id) }
    }, { feature: 'setlist', uid: t.uid }) : undefined,
    has('rating') && occId && occRateable(occId, now) ? section('rating', async () => ({ occId, mine: (await ratingRows(db, occId, now)).find(r => r.uid === t.uid)?.stars ?? 0 }), { feature: 'rating', uid: t.uid }) : undefined,
    has('emojis') && !guest ? section('emojis', () => emojiRow(db, t.uid, cur), { feature: 'emojis', uid: t.uid }) : undefined,
    has('host') && !guest ? section('host', async () => hostAccess(db, await hostContextFor(t, db, now, true), now)) : undefined,
  ])
  const out: MeBundle = { at: now }
  if (presence !== undefined) out.presence = presence
  if (skip !== undefined) out.skip = skip
  if (vote !== undefined) out.vote = vote
  if (setlist !== undefined) out.setlist = setlist
  if (rating !== undefined) out.rating = rating
  if (emojis !== undefined) out.emojis = emojis
  if (host !== undefined) out.host = host
  return out
}
