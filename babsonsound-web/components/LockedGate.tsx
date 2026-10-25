'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/** Wrap stored content (episodes/backlog). Students and developers, plus guests with a sponsor's pass or a student connection. */
export default function LockedGate({ children }: { children: ReactNode }) {
  const { loading, user, needsVerification, hasLibraryAccess, isGuest } = useAuth()
  if (loading) return null
  if (hasLibraryAccess) return <>{children}</>

  const message = !user
    ? 'Sign in with your school email to listen.'
    : needsVerification
      ? 'Verify your email to unlock this.'
      : isGuest
        ? 'Students only. Sign in with your school email.'
        : 'This is for Students.'

  return (
    <div className="sk-raised rounded-2xl p-8 text-center">
      <p className="font-display text-br-dk-text text-xl tracking-widest mb-2">Locked</p>
      <p className="text-br-dk-sub text-sm mb-5">{message}</p>
      <div className="flex justify-center gap-4 font-display tracking-widest text-sm">
        <Link href="/auth" className="text-br-gold">Sign in</Link>
      </div>
    </div>
  )
}
