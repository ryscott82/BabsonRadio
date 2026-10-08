'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/** The interest form is only for beta testers. Everyone else, signed in or not, never sees it. */
export default function InterestFormCta({ children }: { children: ReactNode }) {
  const { loading, user, isTester } = useAuth()
  if (loading) return null
  if (!user || !isTester) return null
  return <>{children}</>
}
