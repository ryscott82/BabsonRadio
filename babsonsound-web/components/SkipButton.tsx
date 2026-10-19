'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import type { NowPlaying } from '@/lib/nowplaying'

interface Skip { votes: number; needed: number; mine: boolean; eligible: boolean }

/** Next-track button beside play/pause. Only shows when the station is playing its own music; shows "X/Y requested". */
export default function SkipButton({ np }: { np: NowPlaying | null }) {
  const { user } = useAuth()
  const autoPlay = !!np?.title && !np.isLive && !np.isShow
  const [skip, setSkip] = useState<Skip | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!user || !autoPlay) { queueMicrotask(() => setSkip(null)); return }
    const load = () => { if (!document.hidden) apiGet<Skip>('/api/skip').then(setSkip).catch(() => {}) }
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [user, autoPlay, np?.playedAt, np?.title])

  async function ask() {
    setErr('')
    try { setSkip(await api<Skip>('/api/skip', {})) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send your skip.') }
  }

  if (!skip?.eligible) return null
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={ask} disabled={skip.mine}
              aria-label={skip.mine ? 'You asked to skip this song' : 'Ask to skip this song'}
              className="hw-knob-sm hw-skip w-[58px] h-[58px] rounded-full flex items-center justify-center text-[#1a1710] disabled:opacity-70">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M6 6l9 6-9 6V6zm10 0h2v12h-2V6z" /></svg>
      </button>
      <span className="text-xs font-semibold text-br-dk-text">Ask to skip</span>
      <span className="text-[11px] hw-sub tabular-nums -mt-1" role="status">{skip.votes}/{skip.needed} requested</span>
      {err && <span role="alert" className="text-[11px] text-br-red max-w-[10rem] text-center">{err}</span>}
    </div>
  )
}
