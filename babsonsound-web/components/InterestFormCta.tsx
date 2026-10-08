'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/** The interest form is for people who have not joined yet. Hidden once someone is signed in, unless they are a beta tester. */
export default function InterestFormCta({ children }: { children: ReactNode }) {
  const { loading, user, isTester } = useAuth()
  if (loading) return null
  if (user && !isTester) return null
  return <>{children}</>
}
