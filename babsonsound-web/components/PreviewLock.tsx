'use client'

import { useEffect } from 'react'
import { auth } from '@/lib/firebase'
import { forgetUnlock, hasUnlockCookie, isReload, isTesterUnlock, tabUnlocked } from '@/lib/prelaunch-client'

// Developer access lasts for the current tab: clicking around, opening admin pages and typing a URL in
// the same tab all keep working. A refresh, or opening the site in a new tab or window, locks it again.
export default function PreviewLock() {
  useEffect(() => {
    if (!hasUnlockCookie() || isTesterUnlock()) return
    if (isReload() || !tabUnlocked()) {
      forgetUnlock()
      if (auth.currentUser?.uid === 'preview-developer') auth.signOut().catch(() => {})
      if (location.pathname !== '/coming-soon') location.replace('/coming-soon')
    }
  }, [])
  return null
}
