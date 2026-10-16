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
  updatedAt: number
  /** client clock (ms) when this was fetched, for the progress bar */
  receivedAt: number
}

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
  useEffect(() => {
    if (!np || np.isLive || np.duration <= 0 || !np.next) return
    const end = np.playedAt > 0 ? (np.playedAt + np.duration) * 1000 : np.receivedAt + (np.duration - np.elapsed) * 1000
    const wait = Math.max(0, end + HEAR_DELAY_MS - Date.now())
    if (wait > 20 * 60_000) return
    let second: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(() => {
      setAdvanced(key)
      load.current(true)
      second = setTimeout(() => load.current(true), 2_500)
    }, wait)
    return () => { clearTimeout(t); if (second) clearTimeout(second) }
  }, [np, key])

  return useMemo(() => {
    if (np && advanced === key && np.next) return { ...np, title: np.next.title, artist: np.next.artist, elapsed: 0, duration: 0, next: null }
    return np
  }, [np, advanced, key])
}
