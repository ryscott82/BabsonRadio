'use client'

import { useEffect } from 'react'
import { PRELAUNCH_COOKIE } from '@/lib/prelaunch-client'

// Developer access is not remembered: when the page is refreshed, left or closed, the unlock cookie is
// removed, so the next load goes back to the "RADIO IS BACK" page. (Firebase sign-in is in memory only.)
export default function PreviewLock() {
  useEffect(() => {
    const clear = () => {
      document.cookie = `${PRELAUNCH_COOKIE}=; path=/; max-age=0; SameSite=Lax`
    }
    window.addEventListener('pagehide', clear)
    return () => window.removeEventListener('pagehide', clear)
  }, [])
  return null
}
