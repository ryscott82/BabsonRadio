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
    ? 'Sign in with your Babson email to listen.'
    : needsVerification
      ? 'Verify your Babson email to unlock this.'
      : isGuest
        ? 'The Library opens when a Babson student sponsors you. Ask one from your guest page.'
        : 'This is for Babson students.'

  return (
    <div className="rounded-2xl border border-br-dk-border bg-br-dk-surface p-8 text-center">
      <p className="font-display text-br-dk-text text-xl tracking-widest mb-2">LOCKED</p>
      <p className="text-br-dk-sub text-sm mb-5">{message}</p>
      <div className="flex justify-center gap-4 font-display tracking-widest text-sm">
        <Link href="/auth" className="text-br-gold">SIGN IN</Link>
        {!user && <Link href="/auth/guest" className="text-br-dk-sub hover:text-br-dk-text">GUEST ACCESS</Link>}
      </div>
    </div>
  )
}
