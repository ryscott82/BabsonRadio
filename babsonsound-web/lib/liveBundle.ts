// The live page's data in one call. Pure: no server or browser imports, so the tests can run it.
//
// GET /api/live/bundle has two halves:
//   shared   the same for everyone (listener count, skip tally, vote tally, set list, show rating). No sign-in header, so
//            Vercel's edge serves it from cache for 15 s (then refreshes in the background): a cache hit runs no function.
//   me       what depends on who is asking (friends, your skip / vote / stars, your reactions, host access). Never cached,
//            and asked for much less often.
// Clients that cannot split the calls (older apps) can send the sign-in header with no `part`: they get both halves.
// While someone is playing, the personal half arrives with the listening check-in (POST /api/listen) instead of a separate call.

// The shared half is the "who is tuned in" snapshot plus the show rating and the tallies as first loaded. Edge cached for a minute (then
// refreshed in the background), so a crowd costs one function run a minute at most. Tallies after the first load are pushed (liveState).
export const SHARED_CACHE = 'public, s-maxage=60, stale-while-revalidate=120'
export const PRIVATE_CACHE = 'private, no-store'

/** How often a listening page checks in (one call: one-device rule, presence, personal data). The server can change it: see refreshSecOf. */
export const DEFAULT_REFRESH_SEC = 720
export const REFRESH_MS = DEFAULT_REFRESH_SEC * 1000
/** The server may set the interval between 2 and 60 minutes; anything else falls back to the default. */
export const refreshSecOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 120 && v <= 3600 ? Math.round(v) : DEFAULT_REFRESH_SEC)
/** Someone counts as tuned in this long after their last check-in (the check-in is every 12 minutes, so one missed beat is still covered). */
export const PRESENCE_TTL_MS = 18 * 60_000
/** A tab that comes back to the front refreshes at once, but not if it refreshed in the last 2 minutes. */
export const RESUME_MIN_AGE_MS = 120_000

export const SECTIONS = ['presence', 'skip', 'vote', 'setlist', 'rating', 'emojis', 'host'] as const
export type Section = (typeof SECTIONS)[number]
/** Slow-changing sections: asked once on page load and once per show, never on the refresh timer. */
export const SLOW_SECTIONS: readonly Section[] = ['emojis', 'host', 'rating']

/** Same pattern as /api/live/rating: weekly-<id>_<start>, slot-, event-, genre-. Anything else is ignored, not an error, so junk never makes new cache entries that do work. */
export const OCC = /^(weekly|slot|event|genre)-([^/]{1,100})_(\d{10,14})$/
export const cleanOcc = (v: unknown): string => (typeof v === 'string' && v.length <= 160 && OCC.test(v) ? v : '')

export type Want = 'shared' | 'me' | 'full'
/**
 * Which half(s) to send. `part=shared` and `part=me` are explicit. With no `part`, a request with a sign-in header gets everything
 * (older apps), and one without gets the shared half only (that is the cached one).
 */
export function wantOf(part: string | null, signedIn: boolean): Want {
  if (part === 'shared') return 'shared'
  if (part === 'me') return 'me'
  return signedIn ? 'full' : 'shared'
}
export const cacheControlFor = (w: Want) => (w === 'shared' ? SHARED_CACHE : PRIVATE_CACHE)

/** `sections=skip,vote` -> a list of known section names. Nothing (or nothing valid) means all of them. */
export function sectionsOf(raw: string | null): Section[] {
  if (!raw) return [...SECTIONS]
  const out = SECTIONS.filter(s => raw.split(',').includes(s))
  return out.length ? out : [...SECTIONS]
}

// ── what the server sends ──

export interface SharedBundle {
  at: number
  presence: { count: number }
  skip: { eligible: boolean; votes: number; needed: number; skipped: boolean }
  vote: {
    blockStart: number; blockEnd: number; threshold: number; options: { label: string; count: number }[]
    winner: string | null; upNext: { blockStart: number; label: string } | null; requestsOpen: boolean; requestsShow: string
  }
  setlist: { occId: string; title: string; songs: { id: string; text: string; votes: number }[] }
  /** Only when the caller named a show (`occId=`). */
  rating: { occId: string; count: number; avg: number } | null
}

export interface MeBundle {
  at: number
  /** Present only for sections asked for; a section that failed on the server is null so the rest still arrive. */
  presence?: { friends: { uid: string; firstName: string; instagram?: string }[]; groups: { kind: string; label: string; count: number; text: string }[] } | null
  skip?: { mine: boolean } | null
  vote?: { myVote: string | null; canVote: boolean } | null
  setlist?: { occId: string; mine: string[] } | null
  rating?: { occId: string; mine: number } | null
  emojis?: { emojis: string[]; top: string[]; customized: boolean } | null
  host?: { host: boolean; hosting: boolean; controlsOpen: boolean } | null
}

export interface BundleReply { v: 1; shared?: SharedBundle; me?: MeBundle }

// ── what the components used to get from the separate routes ──

export interface SkipView { votes: number; needed: number; mine: boolean; eligible: boolean }
export function skipView(s: SharedBundle | null, me: MeBundle | null): SkipView | null {
  if (!s) return null
  return { votes: s.skip.votes, needed: s.skip.needed, eligible: s.skip.eligible, mine: !!me?.skip?.mine }
}

export interface VoteView {
  blockStart: number; blockEnd: number; threshold: number; options: { label: string; count: number }[]
  myVote: string | null; winner: string | null; upNext: { blockStart: number; label: string } | null
  canVote: boolean; requestsOpen: boolean; requestsShow: string
}
/** Needs both halves: the tally is shared, whether you may vote and what you picked are yours. */
export function voteView(s: SharedBundle | null, me: MeBundle | null): VoteView | null {
  if (!s || !me?.vote) return null
  return { ...s.vote, myVote: me.vote.myVote, canVote: me.vote.canVote }
}

export interface SongView { id: string; text: string; votes: number; mine: boolean }
export function songsView(s: SharedBundle | null, me: MeBundle | null): { title: string; songs: SongView[] } {
  if (!s) return { title: '', songs: [] }
  const mine = new Set(me?.setlist && me.setlist.occId === s.setlist.occId ? me.setlist.mine : [])
  return { title: s.setlist.title, songs: s.setlist.songs.map(x => ({ ...x, mine: mine.has(x.id) })) }
}

export interface RatingView { avg: number; count: number; mine: number }
export function ratingView(s: SharedBundle | null, me: MeBundle | null, occId: string): RatingView {
  const sh = s?.rating && s.rating.occId === occId ? s.rating : null
  const my = me?.rating && me.rating.occId === occId ? me.rating.mine : 0
  return { avg: sh?.avg ?? 0, count: sh?.count ?? 0, mine: my }
}

// ── when a page may ask ──

export type PollKind = 'poll' | 'beat'
/**
 * Hidden tabs do not ask for anything. The one exception is the listening check-in while audio is playing (`beat`, every 12 minutes):
 * without it the station would think the listener left. A paused hidden tab sends nothing at all.
 */
export function pollAllowed(o: { hidden: boolean; playing: boolean; kind: PollKind }): boolean {
  if (!o.hidden) return true
  return o.kind === 'beat' && o.playing
}

/** Is this part due? `age` is ms since it last arrived (Infinity if never). */
export const dueFor = (age: number, every: number, o: { hidden: boolean; resumed?: boolean }) =>
  !o.hidden && age >= (o.resumed ? RESUME_MIN_AGE_MS : every)

/** Keep only the newest copy of the shared half: a cached copy that arrives late must not undo a fresher one. */
export const newerShared = (cur: SharedBundle | null, incoming: SharedBundle): SharedBundle => (cur && incoming.at < cur.at ? cur : incoming)

/** The show can be rated now: its start is not in the future and not more than 12 hours ago (same rule as /api/live/rating). */
export function occRateable(occId: string, now: number): boolean {
  const m = OCC.exec(occId)
  if (!m) return false
  const startAt = Number(m[3])
  return !(startAt > now || startAt < now - 12 * 3_600_000)
}

/**
 * Put a (possibly partial) personal reply on top of what the page already has: sections that were not asked for stay as they were,
 * and a section that failed or was throttled on the server (null) does not wipe a good copy.
 */
export function mergeMe(cur: MeBundle | null, inc: MeBundle): MeBundle {
  const out: Record<string, unknown> = { ...(cur ?? {}), at: inc.at }
  const c = (cur ?? {}) as Record<string, unknown>
  const i = inc as unknown as Record<string, unknown>
  for (const k of SECTIONS) {
    const v = i[k]
    if (v === undefined) continue
    if (v === null && c[k]) continue
    out[k] = v
  }
  return out as unknown as MeBundle
}

/** The sections a refresh asks for: everything the page shows on a first load or a new show, otherwise without the slow-changing ones. */
export const sectionsForRefresh = (needed: Section[], o: { first: boolean }): Section[] => (o.first ? needed : needed.filter(s => !SLOW_SECTIONS.includes(s)))
