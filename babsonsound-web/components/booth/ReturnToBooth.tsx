'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { shouldReturnToBooth } from '@/lib/booth'
import { helper, loadPref, type Butt } from './helper'

/** Studio PC only: if the kiosk ends up on some other page (the sign-in page, a followed link) and nobody touches it for 90 seconds, go back to /booth.
 *  The booth page marks this browser as the studio PC (pref "studioPc") once it has talked to the local helper; on any other device the pref is
 *  missing, so this renders nothing, listens to nothing and asks nothing. */
export default function ReturnToBooth() {
  const path = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const last = useRef(0)
  const live = useRef({ onAir: false, recording: false, sound: false })
  const signedIn = !!user
  const [pc, setPc] = useState(false)
  useEffect(() => { queueMicrotask(() => setPc(loadPref('studioPc', '') === '1')) }, [])
  useEffect(() => {
    if (path === '/booth' || loadPref('studioPc', '') !== '1') return
    last.current = Date.now()
    const touch = () => { last.current = Date.now() }
    const evs = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const
    evs.forEach(e => window.addEventListener(e, touch, { passive: true }))
    const tick = setInterval(async () => {
      try { const b = await helper<Butt>('/status'); live.current = { onAir: b.connected || b.connecting, recording: b.recording, sound: b.signal && !b.silence } } catch { /* helper not answering: nothing to protect */ }
      if (live.current.sound) last.current = Date.now()
      if (shouldReturnToBooth({ pathname: path, idleMs: Date.now() - last.current, onAir: live.current.onAir, recording: live.current.recording, soundOnInput: live.current.sound, signedIn })) router.replace('/booth')
    }, 5000)
    return () => { clearInterval(tick); evs.forEach(e => window.removeEventListener(e, touch)) }
  }, [path, router, signedIn])
  // Away from the booth on the studio PC (booking a show, signing in): a way back that needs no keyboard.
  if (!pc || path === '/booth') return null
  return <a href="/booth" className="gbtn fixed bottom-4 right-4 z-[90] h-16 px-8 text-2xl grid place-items-center">Back to the booth</a>
}
