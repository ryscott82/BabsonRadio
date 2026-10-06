'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/** Wrap locked content: <LockedGate>…</LockedGate>. Members (Babson or active guest) see children. */
export default function LockedGate({ children }: { children: ReactNode }) {
  const { loading, user, needsVerification, hasMemberAccess, guestPass } = useAuth()
  if (loading) return null
  if (hasMemberAccess) return <>{children}</>

  const message = !user
    ? 'Sign in with your Babson email to listen.'
    : needsVerification
      ? 'Verify your Babson email to unlock this.'
      : guestPass
        ? 'Your guest pass has ended. Ask a Babson student for a new one.'
        : 'This is for Babson students. Ask one to sponsor you.'

  return (
    <div className="rounded-2xl border border-br-dk-border bg-br-dk-surface p-8 text-center">
      <p className="font-display text-br-dk-text text-xl tracking-widest mb-2">LOCKED</p>
      <p className="text-br-dk-sub text-sm mb-5">{message}</p>
      <div className="flex justify-center gap-4 font-display tracking-widest text-sm">
        <Link href="/auth" className="text-br-gold">SIGN IN</Link>
        <Link href="/auth/guest" className="text-br-dk-sub hover:text-br-dk-text">GUEST ACCESS</Link>
      </div>
    </div>
  )
}
