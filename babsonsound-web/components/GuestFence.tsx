'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { signOut } from '@/lib/auth'

// Guests (any email that is not Babson, Olin or Wellesley) only get the Live page. These stay reachable for everyone.
const ALLOWED = ['/', '/auth', '/about', '/privacy', '/terms', '/unsubscribe', '/delete-account']

// Pages a guest is sent to sign in for (they sign out first, so the sign-in page opens instead of bouncing back).
const SIGN_IN_PAGES = ['/schedule', '/library', '/browse', '/shows']
const under = (path: string, p: string) => path === p || path.startsWith(`${p}/`)

// An account past its 7 days without a verified email sees only the verify screen (the server refuses the rest too).
const LOCKED_OK = ['/auth', '/privacy', '/terms', '/delete-account', '/unsubscribe']

/** Sends a guest who opens any other page back to Live, and a locked (unverified) account to the verify screen. The server refuses those calls too. */
export default function GuestFence() {
  const { isGuest, loading, needsVerification } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (loading) return
    if (needsVerification) {
      if (!LOCKED_OK.some(p => under(pathname, p))) router.replace('/auth')
      return
    }
    if (!isGuest) return
    if (SIGN_IN_PAGES.some(p => under(pathname, p))) { signOut().finally(() => router.replace('/auth')); return }
    if (!ALLOWED.some(p => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)))) router.replace('/')
  }, [loading, isGuest, needsVerification, pathname, router])
  return null
}

/** Hides what is inside from guests entirely: no disabled buttons, no teasers. */
export function HideForGuests({ children }: { children: ReactNode }) {
  const { isGuest } = useAuth()
  return isGuest ? null : <>{children}</>
}
