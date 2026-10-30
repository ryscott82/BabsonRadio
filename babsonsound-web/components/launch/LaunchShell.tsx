'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet, apiGetPublic } from '@/lib/auth'
import { LAUNCH_MS } from '@/lib/launch'
import CountdownHome from './CountdownHome'
import WaitingScreen from './WaitingScreen'

interface Status { open: boolean; launchAt: string; locked?: boolean }

// These work for everyone before launch, with no site chrome around them for locked accounts.
const OPEN_PATHS = ['/auth', '/privacy', '/terms', '/unsubscribe', '/studioaccess']
const isOpenPath = (p: string) => OPEN_PATHS.some(o => p === o || p.startsWith(`${o}/`))

/**
 * Before launch: signed-out visitors see the countdown on `/`, and locked accounts see only the waiting screen.
 * Admins, directors and trained hosts (not locked) get the normal site. At launch time everyone moves into the site on their own.
 * `chrome` is the normal site (nav, page, footer); `page` is just the route, for the sign-up check-your-email step.
 */
export default function LaunchShell({ chrome, page }: { chrome: ReactNode; page: ReactNode }) {
  const { user, loading, needsVerification } = useAuth()
  const pathname = usePathname()
  const uid = user?.uid ?? null
  const [launched, setLaunched] = useState(false) // the clock has passed the launch time
  const [open, setOpen] = useState(false)         // the server says the site is open
  const [locked, setLocked] = useState<{ uid: string | null; value: boolean } | null>(null)

  // Watch the clock (cheap: one check a second, no re-render unless it flips).
  useEffect(() => {
    const check = () => { if (Date.now() >= LAUNCH_MS) setLaunched(true) }
    check()
    const t = setInterval(check, 1000)
    return () => clearInterval(t)
  }, [])

  // At zero, ask the server until it says open. A random pause spreads the crowd out.
  useEffect(() => {
    if (!launched || open) return
    let stop = false, timer: ReturnType<typeof setTimeout>
    const ask = async () => {
      try {
        const s = await apiGetPublic<Status>('/api/launch/status')
        if (s.open) { if (!stop) setOpen(true); return }
      } catch { /* try again */ }
      if (!stop) timer = setTimeout(ask, 10_000)
    }
    timer = setTimeout(ask, Math.random() * 4000)
    return () => { stop = true; clearTimeout(timer) }
  }, [launched, open])

  // Signed in before launch: is this account locked?
  useEffect(() => {
    if (loading || open) return
    if (!uid) { queueMicrotask(() => setLocked(null)); return }
    let stop = false
    apiGet<Status>('/api/launch/status')
      .then(s => { if (stop) return; if (s.open) setOpen(true); setLocked({ uid, value: s.locked === true }) })
      .catch(() => { if (!stop) setLocked({ uid, value: false }) }) // the server still enforces the lock
    return () => { stop = true }
  }, [uid, loading, open])

  if (open) return <>{chrome}</>

  if (user) {
    const known = locked?.uid === user.uid
    if (!known) return isOpenPath(pathname) ? <>{chrome}</> : <div className="min-h-dvh" aria-busy="true" />
    if (!locked.value) return <>{chrome}</>
    if (pathname === '/auth' && needsVerification) return <main className="hw-stage relative z-[1] min-h-dvh pt-6">{page}</main>
    if (isOpenPath(pathname) && pathname !== '/auth') return <main className="hw-stage relative z-[1] min-h-dvh pt-6">{page}</main>
    return <WaitingScreen />
  }

  if (pathname === '/') return <CountdownHome />
  return <>{chrome}</>
}
