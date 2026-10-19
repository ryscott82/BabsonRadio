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
  /** client clock (ms) when this was fetched, for the progress bar */
  receivedAt: number
}

/** Cover checks: a track that just finished gets a fresh look this long after its end, and a metadata change gets follow-ups for late covers. */
const COVER_CHECK_MS = 2_000
const COVER_RETRY_MS = [2_000, 6_000, 12_000]

/** The stream reaches your ears a few seconds after the server's clock, so wait this long past the song's end before swapping the title. */
const HEAR_DELAY_MS = 5_000

/**
 * Polls /api/nowplaying while the tab is visible. When the current song's end time passes, it swaps in the next
 * song's title and artist right away (instead of waiting for the next poll) and asks the server for the real data.
 */
export function useNowPlaying(everyMs = 12_000): NowPlaying | null {
  const [np, setNp] = useState<NowPlaying | null>(null)
  const [advanced, setAdvanced] = useState('') // which song we have already moved past
  const load = useRef<(fresh?: boolean) => void>(() => {})
  useEffect(() => {
    let alive = true
    load.current = (fresh = false) => {
      if (document.hidden) return
      // At a song change, skip the edge cache so the new song shows as soon as the server has it.
      fetch(fresh ? `/api/nowplaying?t=${Date.now()}` : '/api/nowplaying').then(r => (r.ok ? r.json() : null)).then(d => { if (alive && d) setNp({ ...d, receivedAt: Date.now() }) }).catch(() => {})
    }
    const poll = () => load.current()
    poll()
    const t = setInterval(poll, everyMs)
    document.addEventListener('visibilitychange', poll)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', poll) }
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

  return useMemo(() => {
    if (np && advanced === key && np.next) return { ...np, title: np.next.title, artist: np.next.artist, album: '', art: '', elapsed: 0, duration: 0, next: null } // the old cover must not sit on the new title
    return np
  }, [np, advanced, key])
}
