'use client'

import { openSignIn } from '@/lib/signInPrompt'
import { useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, signOut } from '@/lib/auth'
import type { NowPlaying } from '@/lib/nowplaying'
import { skipView, type SkipView as Skip } from '@/lib/liveBundle'
import { refreshAfterAction, useLiveBundle, useOverlay } from '@/lib/liveStore'

/** Next-track button beside play/pause. Only shows when the station is playing its own music; shows "X/Y requested". */
export default function SkipButton({ np }: { np: NowPlaying | null }) {
  const { user, isGuest } = useAuth()
  const autoPlay = !!np?.title && !np.isLive && !np.isShow
  // The tally comes with the rest of the live page (lib/liveStore.ts); which skip is yours is in your own half, refreshed after you act.
  const live = useLiveBundle({ sections: user && !isGuest ? ['skip'] : [] })
  const [shown, setSkip] = useOverlay<Skip | null>(skipView(live.shared, live.me), live.version)
  const skip = user && !isGuest && autoPlay ? shown : null
  const [err, setErr] = useState('')
  const pending = useRef(false)

  // Optimistic: the button and count change the instant it is pressed; the server's answer replaces them, and an error puts them back.
  async function ask() {
    if (!skip || skip.mine || pending.current) return
    setErr('')
    const before = skip
    pending.current = true
    setSkip({ ...skip, mine: true, votes: Math.min(skip.needed, skip.votes + 1) })
    try { setSkip(await api<Skip>('/api/skip', {})); refreshAfterAction() }
    catch (e) { setSkip(before); setErr(e instanceof Error ? e.message : 'Could not send your skip.') }
    finally { pending.current = false }
  }

  // Guests and signed-out visitors see the button too; pressing it takes them to sign in.
  if (!user || isGuest) {
    const go = () => { (isGuest ? signOut() : Promise.resolve()).finally(() => openSignIn(!isGuest)) }
    return (
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={go} aria-label={isGuest ? 'Sign in to ask to skip this song' : 'Sign up to ask to skip this song'}
                className="hw-knob-sm hw-skip w-[58px] h-[58px] rounded-full flex items-center justify-center text-[#1a1710]">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M6 6l9 6-9 6V6zm10 0h2v12h-2V6z" /></svg>
        </button>
        <span className="text-sm font-semibold text-br-dk-text">Ask to skip</span>
      </div>
    )
  }
  // Signed-in members always see the button; it is greyed out when skipping is not available (live shows).
  if (!skip?.eligible) return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" disabled aria-label="Skipping is not available right now"
              className="hw-knob-sm hw-skip w-[58px] h-[58px] rounded-full flex items-center justify-center text-[#1a1710] opacity-50 cursor-not-allowed">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M6 6l9 6-9 6V6zm10 0h2v12h-2V6z" /></svg>
      </button>
      <span className="text-sm font-semibold text-br-dk-text">Ask to skip</span>
    </div>
  )
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={ask} disabled={skip.mine}
              aria-label={skip.mine ? 'You asked to skip this song' : 'Ask to skip this song'}
              className={`hw-knob-sm hw-skip w-[58px] h-[58px] rounded-full flex items-center justify-center text-[#1a1710] disabled:opacity-70 ${skip.mine ? 'hw-lit' : ''}`}>
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M6 6l9 6-9 6V6zm10 0h2v12h-2V6z" /></svg>
      </button>
      <span className="text-sm font-semibold text-br-dk-text">Ask to skip</span>
      <span className="text-sm hw-sub tabular-nums -mt-1" role="status">{skip.votes >= skip.needed ? 'Skipping...' : <>{skip.mine ? 'Skip requested · ' : ''}{skip.votes}/{skip.needed}{skip.mine ? '' : ' requested'}</>}</span>
      {err && <span role="alert" className="text-sm text-br-red max-w-[10rem] text-center">{err}</span>}
    </div>
  )
}
