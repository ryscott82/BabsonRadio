'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

/**
 * "Host a show" in one place everywhere it is useful (Members, Schedule, Library, after training, My shows, a declined request).
 * Students get the button. Signed-out people get a sign-in link. Guests (not a school email) see nothing at all.
 */
export default function HostShowCard({ title = 'Host a show', note = 'Pick a time, tell us about it, send. It takes a minute.', label = 'Host a show', href = '/slots', compact }: {
  title?: string; note?: string; label?: string; href?: string; compact?: boolean
}) {
  const { user, isBabson, isGuest, loading } = useAuth()
  if (loading || isGuest) return null
  const student = !!user && isBabson
  const button = 'sk-key hw-pill inline-flex items-center justify-center h-11 px-5 rounded-full text-base font-semibold'
  const tint = { '--hw-key-tint': 'linear-gradient(rgba(14,143,97,.38), rgba(14,143,97,.38))' } as React.CSSProperties
  if (compact) {
    return student
      ? <Link href={href} style={tint} className={button}>{label}</Link>
      : <Link href="/auth" className={button}>Sign in to host</Link>
  }
  return (
    <section className="sk-raised rounded-2xl p-5 flex flex-wrap items-center gap-4" aria-label={title}>
      <div className="flex-1 min-w-[14rem]">
        <h2 className="font-display text-br-dk-text text-xl tracking-widest">{title}</h2>
        <p className="text-base text-br-dk-sub mt-1">{student ? note : 'Sign in with your school email to host a show.'}</p>
      </div>
      {student
        ? <Link href={href} style={tint} className={button}>{label}</Link>
        : <Link href="/auth" className={button}>Sign in</Link>}
    </section>
  )
}
