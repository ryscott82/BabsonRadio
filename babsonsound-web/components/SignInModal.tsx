'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import SignInForm from '@/components/SignInForm'

/** Sign-in pop-up that opens over whatever page the visitor is on (see openSignIn in lib/signInPrompt.ts). It closes itself once they are signed in. */
export default function SignInModal() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState<null | { create: boolean }>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const on = (e: Event) => { if (!user && !pathname.startsWith('/auth')) setOpen({ create: (e as CustomEvent<boolean>).detail === true }) }
    window.addEventListener('br:signin-open', on)
    return () => window.removeEventListener('br:signin-open', on)
  }, [user, pathname])
  useEffect(() => { if (user) queueMicrotask(() => setOpen(null)) }, [user])
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', esc)
    box.current?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true })
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc) }
  }, [open])

  if (!open || user) return null
  return (
    <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(null) }}>
      <div className="min-h-full flex items-center justify-center p-4">
        <div ref={box} role="dialog" aria-modal="true" aria-labelledby="signin-title" className="hw-panel hw-big w-full max-w-md relative">
          <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="absolute right-4 top-4 text-br-dk-sub hover:text-br-dk-text text-2xl leading-none">×</button>
          <h2 id="signin-title" className="font-display text-br-dk-text text-2xl sm:text-3xl tracking-wide text-center mb-6 px-6">Sign In to Access all Features</h2>
          <SignInForm key={String(open.create)} initialCreate={open.create} />
        </div>
      </div>
    </div>
  )
}
