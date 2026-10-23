'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

// Guests (any email that is not Babson, Olin or Wellesley) only get the Live page. These stay reachable for everyone.
const ALLOWED = ['/', '/auth', '/about', '/privacy', '/terms', '/unsubscribe']

/** Sends a guest who opens any other page back to Live. The server refuses those calls too. */
export default function GuestFence() {
  const { isGuest, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (loading || !isGuest) return
    if (!ALLOWED.some(p => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)))) router.replace('/')
  }, [loading, isGuest, pathname, router])
  return null
}

/** Hides what is inside from guests entirely: no disabled buttons, no teasers. */
export function HideForGuests({ children }: { children: ReactNode }) {
  const { isGuest } = useAuth()
  return isGuest ? null : <>{children}</>
}
