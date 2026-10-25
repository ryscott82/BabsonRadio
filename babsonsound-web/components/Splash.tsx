'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { markSplashSeen, requestTryIt, splashSeen } from '@/lib/splash'

/** Shown once per browser to signed-out visitors on the home page. /?splash=1 shows it again for testing. */
export default function Splash() {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (loading || user || pathname !== '/') { queueMicrotask(() => setOpen(false)); return }
    const forced = new URLSearchParams(location.search).get('splash') === '1'
    if (forced || !splashSeen()) queueMicrotask(() => setOpen(true))
  }, [loading, user, pathname])

  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  function done() {
    markSplashSeen()
    setOpen(false)
    if (new URLSearchParams(location.search).get('splash')) history.replaceState(null, '', '/')
  }
  const tryIt = () => { done(); requestTryIt() }
  const go = (href: string) => { done(); router.push(href) }

  const btn = 'block w-full rounded-xl py-3.5 text-base font-display tracking-[0.15em] text-center'
  return (
    <div className="br-splash fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="splash-title" className="hw-panel hw-big w-full max-w-[34rem] text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/beaver.png" alt="" className="w-24 h-auto mx-auto drop-shadow-[0_3px_6px_rgba(0,0,0,.45)]" />
          <h1 id="splash-title" className="hw-title !whitespace-normal text-[2.1rem] sm:text-[2.6rem] mt-4">Welcome to Babson Radio</h1>
          <p className="hw-sub !text-br-dk-text text-lg mt-3">The only place to hear your favorite Babson DJs, podcasts and interviews, and new music</p>
          <div className="mt-7 space-y-3">
            <button ref={first} type="button" onClick={tryIt} className={`sk-btn ${btn}`}>Try it out</button>
            <button type="button" onClick={() => go('/auth?mode=create')} className={`sk-key ${btn}`}>Sign Up</button>
            <button type="button" onClick={() => go('/auth')} className={`sk-key ${btn}`}>Login</button>
          </div>
        </div>
      </div>
    </div>
  )
}
