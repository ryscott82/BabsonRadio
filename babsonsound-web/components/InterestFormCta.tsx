'use client'

import { useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const KEY = 'br-interest-dismissed'

/** The interest form is only for beta testers. Everyone else, signed in or not, never sees it. Testers can close it (remembered on this device). */
export default function InterestFormCta({ children }: { children: ReactNode }) {
  const { loading, user, isTester } = useAuth()
  const [hidden, setHidden] = useState(() => { try { return typeof window !== 'undefined' && localStorage.getItem(KEY) === '1' } catch { return false /* private window: it just comes back next visit */ } })
  if (loading || hidden) return null
  if (!user || !isTester) return null
  return (
    <div className="relative shrink-0">
      {children}
      <button type="button" aria-label="Dismiss" title="Dismiss"
              onClick={() => { setHidden(true); try { localStorage.setItem(KEY, '1') } catch { /* ignore */ } }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-br-dk-sub hover:text-br-dk-text text-lg leading-none">×</button>
    </div>
  )
}
