'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet, signOut } from '@/lib/auth'
import type { NowPlaying } from '@/lib/nowplaying'

interface Skip { votes: number; needed: number; mine: boolean; eligible: boolean }

/** Next-track button beside play/pause. Only shows when the station is playing its own music; shows "X/Y requested". */
export default function SkipButton({ np }: { np: NowPlaying | null }) {
  const { user, isGuest } = useAuth()
  const router = useRouter()
  const autoPlay = !!np?.title && !np.isLive && !np.isShow
  const [skip, setSkip] = useState<Skip | null>(null)
  const [err, setErr] = useState('')
  const pending = useRef(false)

  useEffect(() => {
    if (!user || isGuest || !autoPlay) { queueMicrotask(() => setSkip(null)); return }
    const load = () => { if (!document.hidden) apiGet<Skip>('/api/skip').then(v => { if (!pending.current) setSkip(v) }).catch(() => {}) }
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [user, isGuest, autoPlay, np?.playedAt, np?.title])

  // Optimistic: the button and count change the instant it is pressed; the server's answer replaces them, and an error puts them back.
  async function ask() {
    if (!skip || skip.mine || pending.current) return
    setErr('')
    const before = skip
    pending.current = true
    setSkip({ ...skip, mine: true, votes: Math.min(skip.needed, skip.votes + 1) })
    try { setSkip(await api<Skip>('/api/skip', {})) }
    catch (e) { setSkip(before); setErr(e instanceof Error ? e.message : 'Could not send your skip.') }
    finally { pending.current = false }
  }

  // Guests and signed-out visitors see the button too; pressing it takes them to sign in.
  if (!user || isGuest) {
    if (!autoPlay) return null
    const go = () => { (isGuest ? signOut() : Promise.resolve()).finally(() => router.push('/auth')) }
    return (
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={go} aria-label="Sign in to ask to skip this song"
                className="hw-knob-sm hw-skip w-[58px] h-[58px] rounded-full flex items-center justify-center text-[#1a1710]">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M6 6l9 6-9 6V6zm10 0h2v12h-2V6z" /></svg>
        </button>
        <span className="text-xs font-semibold text-br-dk-text">Ask to skip</span>
      </div>
    )
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
      <span className="text-[11px] hw-sub tabular-nums -mt-1" role="status">{skip.votes >= skip.needed ? 'Skipping...' : <>{skip.mine ? 'Skip requested · ' : ''}{skip.votes}/{skip.needed}{skip.mine ? '' : ' requested'}</>}</span>
      {err && <span role="alert" className="text-[11px] text-br-red max-w-[10rem] text-center">{err}</span>}
    </div>
  )
}
