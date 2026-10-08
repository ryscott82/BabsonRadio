'use client'

import { useEffect, useState } from 'react'

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
  note: { headline: string; message: string; updatedAt: number; by: string } | null
  announcement: { text: string; updatedAt: number; until: number } | null
  updatedAt: number
  /** client clock (ms) when this was fetched, for the progress bar */
  receivedAt: number
}

/** Polls /api/nowplaying while the tab is visible. */
export function useNowPlaying(everyMs = 12_000): NowPlaying | null {
  const [np, setNp] = useState<NowPlaying | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => {
      if (document.hidden) return
      fetch('/api/nowplaying').then(r => (r.ok ? r.json() : null)).then(d => { if (alive && d) setNp({ ...d, receivedAt: Date.now() }) }).catch(() => {})
    }
    load()
    const t = setInterval(load, everyMs)
    document.addEventListener('visibilitychange', load)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', load) }
  }, [everyMs])
  return np
}
