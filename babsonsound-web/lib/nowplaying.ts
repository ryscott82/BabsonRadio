'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface NowPlaying {
  configured: boolean
  title: string; artist: string; album: string; art: string
  elapsed: number; duration: number
  playedAt: number
  history: { title: string; artist: string; art: string; playedAt: number }[]
  isLive: boolean; streamer: string; listeners: number
  next: { title: string; artist: string } | null
  showTitle: string
  blockTitle: string
  color: string
  occId: string
  isShow: boolean
  showStart: number
  showEnd: number
  colorChanging?: boolean
  /** The host's own reaction emojis for this show ([] = the usual ones), and whether ratings are on for it. */
  hostEmojis?: string[]
  ratingsOn?: boolean
  /** A show is on air without track info: title/artist are the show and host names. */
  showOnly?: boolean
  note: { headline: string; message: string; updatedAt: number; by: string } | null
  announcement: { text: string; updatedAt: number; until: number } | null
  /** False when staff turned the browser audio processing off. */
  audioFx?: boolean
  /** Staff switched the ON AIR sign on by hand. */
  onAirManual?: boolean
  updatedAt: number
  /** Set only when the backup way is on: watch this public AzuraCast feed for changes and ask our route only when the song, show or live status changed. */
  direct?: { url: string } | null
  /** client clock (ms) when this was fetched, for the progress bar */
  receivedAt: number
}

/** Cover checks: a track that just finished gets a fresh look this long after its end, and a metadata change gets follow-ups for late covers. */
const COVER_CHECK_MS = 2_000
const COVER_RETRY_MS = [2_000, 6_000, 12_000]

/** The stream reaches your ears a few seconds after the server's clock, so wait this long past the song's end before swapping the title. */
const HEAR_DELAY_MS = 5_000
/** How long the previous cover stays up when the next one hasn't arrived. */
const LINGER_MS = 90_000
/** While the backup way is on, our own route is asked on a slow timer (show names, notes and the like) and AzuraCast's feed is watched for changes. */
const DIRECT_SLOW_MS = 60_000

/** What the page needs to notice from AzuraCast's feed: when the song started, whether someone is live, and who. Pure, so it can be tested. */
export interface FeedMark { playedAt: number; isLive: boolean; streamer: string }
export function feedMark(raw: unknown): FeedMark | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as { now_playing?: { played_at?: unknown }; live?: { is_live?: unknown; streamer_name?: unknown } } | null
  if (!r || !r.now_playing) return null
  return { playedAt: Number(r.now_playing.played_at) || 0, isLive: r.live?.is_live === true, streamer: typeof r.live?.streamer_name === 'string' ? r.live.streamer_name : '' }
}
/** True when the feed shows something different from what we last showed, so our route should be asked now. */
export const feedChanged = (m: FeedMark, np: Pick<NowPlaying, 'playedAt' | 'isLive' | 'streamer'>) =>
  (m.playedAt > 0 && np.playedAt > 0 && m.playedAt !== np.playedAt) || m.isLive !== np.isLive || (m.isLive && m.streamer !== np.streamer)

/**
 * Polls /api/nowplaying while the tab is visible. When the current song's end time passes, it swaps in the next
 * song's title and artist right away (instead of waiting for the next poll) and asks the server for the real data.
 */
export function useNowPlaying(everyMs = 12_000): NowPlaying | null {
  const [np, setNp] = useState<NowPlaying | null>(null)
  const [advanced, setAdvanced] = useState('') // which song we have already moved past
  const load = useRef<(fresh?: boolean) => void>(() => {})
  const npRef = useRef<NowPlaying | null>(null)
  const directRef = useRef<{ url: string } | null>(null)
  useEffect(() => { npRef.current = np; directRef.current = np?.direct ?? null }, [np])
  useEffect(() => {
    let alive = true
    load.current = (fresh = false) => {
      if (document.hidden) return
      // At a song change, skip the edge cache so the new song shows as soon as the server has it. The 2 s buckets mean everyone asking in the same moment shares one answer.
      fetch(fresh ? `/api/nowplaying?t=${Math.floor(Date.now() / 2000)}` : '/api/nowplaying').then(r => (r.ok ? r.json() : null)).then(d => { if (alive && d) setNp({ ...d, receivedAt: Date.now() }) }).catch(() => {})
    }
    // Normal way: ask our route every `everyMs` (the edge answers most of them). Backup way (the route says `direct`): ask it only every minute, and in between
    // watch AzuraCast's public feed, which costs us nothing, and ask our route right away when it shows a new song or a change of live status.
    let lastOurs = 0, directBad = 0
    const ours = (fresh = false) => { lastOurs = Date.now(); load.current(fresh) }
    const poll = () => { if (!(directRef.current && directBad < 2 && Date.now() - lastOurs < DIRECT_SLOW_MS)) ours() }
    const watch = () => {
      const d = directRef.current
      if (!d || directBad >= 2 || document.hidden) return
      fetch(d.url, { cache: 'no-store', credentials: 'omit' }).then(r => (r.ok ? r.json() : Promise.reject(new Error('feed')))).then(raw => {
        const m = feedMark(raw), cur = npRef.current
        if (!m) throw new Error('feed')
        directBad = 0
        if (alive && cur && feedChanged(m, cur)) ours(true)
      }).catch(() => { directBad++ }) // the feed cannot be read from here (blocked, down): go back to the normal way
    }
    poll()
    const t = setInterval(() => { poll(); watch() }, everyMs)
    const onVisible = () => { poll(); watch() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [everyMs])

  const key = np ? `${np.playedAt}|${np.title}` : ''

  // Any metadata change (a new title or artist, or a new cover URL): look again shortly after, because covers often land a moment
  // after the text. The 2 s check always runs; the later ones only while there is still no cover.
  const artRef = useRef('')
  useEffect(() => { artRef.current = np?.art ?? '' }, [np?.art])
  const track = np ? `${np.title}|${np.artist}|${np.album}` : ''
  const seenTrack = useRef('')
  useEffect(() => {
    if (!track) return
    const first = seenTrack.current === ''
    seenTrack.current = track
    if (first) return
    const timers = COVER_RETRY_MS.map((ms, i) => setTimeout(() => { if (i === 0 || !artRef.current) load.current(true) }, ms))
    return () => timers.forEach(clearTimeout)
  }, [track])

  // No cover, but one was showing a little while ago: it's on its way. Keep asking every 4 s (up to 2 minutes) until it lands.
  const lastArtAt = useRef(0)
  const noArt = !!np && !np.art && !np.showOnly
  const hasArt = !!np?.art
  useEffect(() => { if (hasArt) lastArtAt.current = Date.now() }, [hasArt])
  useEffect(() => {
    if (!noArt || Date.now() - lastArtAt.current > 15 * 60_000 || !lastArtAt.current) return
    const stop = Date.now() + 120_000
    const t = setInterval(() => { if (Date.now() > stop) clearInterval(t); else load.current(true) }, 4_000)
    return () => clearInterval(t)
  }, [noArt, track])

  const checkedKey = useRef('')
  const swappedKey = useRef('')
  // 2 s after a track has finished, check for the next one's cover (the title swap itself waits for the stream delay, below).
  useEffect(() => {
    if (!np || np.isLive || np.duration <= 0) return
    const end = np.playedAt > 0 ? (np.playedAt + np.duration) * 1000 : np.receivedAt + (np.duration - np.elapsed) * 1000
    const wait = Math.max(0, end + COVER_CHECK_MS - Date.now())
    if (wait > 20 * 60_000 || checkedKey.current === key) return // once per track, so a slow server can't start a fetch loop
    const t = setTimeout(() => { checkedKey.current = key; load.current(true) }, wait)
    return () => clearTimeout(t)
  }, [np, key])

  useEffect(() => {
    if (!np || np.isLive || np.duration <= 0 || !np.next) return
    const end = np.playedAt > 0 ? (np.playedAt + np.duration) * 1000 : np.receivedAt + (np.duration - np.elapsed) * 1000
    const wait = Math.max(0, end + HEAR_DELAY_MS - Date.now())
    if (wait > 20 * 60_000 || swappedKey.current === key) return // once per track: a slow server must not start a fetch loop
    let second: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(() => {
      swappedKey.current = key
      setAdvanced(key)
      load.current(true)
      second = setTimeout(() => load.current(true), 2_500)
    }, wait)
    return () => { clearTimeout(t); if (second) clearTimeout(second) }
  }, [np, key])

  const shown = useMemo(() => {
    if (np && advanced === key && np.next) return { ...np, title: np.next.title, artist: np.next.artist, album: '', art: '', elapsed: 0, duration: 0, next: null } // the old cover must not sit on the new title
    return np
  }, [np, advanced, key])

  // The old cover lingers while the new one is on its way: it only goes away when a new cover shows up or about 90 s pass with none.
  const [held, setHeld] = useState({ art: '', at: 0 })
  const [gone, setGone] = useState('') // the held cover whose time is up
  const art = shown?.art ?? ''
  useEffect(() => { if (art) queueMicrotask(() => setHeld(h => (h.art === art ? h : { art, at: Date.now() }))) }, [art])
  useEffect(() => {
    if (art || !held.art) return
    const t = setTimeout(() => setGone(held.art), Math.max(0, held.at + LINGER_MS - Date.now()))
    return () => clearTimeout(t)
  }, [art, held])
  return useMemo(() => (shown && !art && held.art && gone !== held.art && !shown.showOnly ? { ...shown, art: held.art } : shown), [shown, art, held.art, gone])
}
