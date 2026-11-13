'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/auth'
import { openSignIn } from '@/lib/signInPrompt'
import { GhostButton, PrimaryButton } from '@/components/AuthUI'

// The page the QR code on the studio door opens (babsonradio.com/booth/door). Signed in already (website, or the app opens this link itself):
// it asks the studio PC to sign you in, and that is all. Signed out: sign in here, and it carries on.

type State = 'wait' | 'sending' | 'done' | 'error'

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-md mx-auto my-8 text-center space-y-4">{children}</div>
}

export default function DoorPage() {
  const { user, loading, isGuest } = useAuth()
  const [state, setState] = useState<State>('wait')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const started = useRef(false)

  const send = useCallback(async () => {
    setState('sending'); setError('')
    try {
      const r = await api<{ firstName: string }>('/api/booth/door', {})
      setName(r.firstName); setState('done')
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); setState('error') }
  }, [])

  useEffect(() => {
    if (loading || !user || isGuest || started.current) return
    started.current = true
    void send()
  }, [loading, user, isGuest, send])

  // The panel: a direct child of <main> with a max-w class turns into the site's stitched leather panel (see .hw-main in hardware.css).
  const title = 'font-display text-4xl tracking-[0.15em]'
  if (loading) return <Shell><p className="text-xl opacity-80">One moment…</p></Shell>
  if (!user) {
    return (
      <Shell>
        <h1 className={title}>Studio sign-in</h1>
        <p className="opacity-80">Sign in to Babson Radio and the studio computer will sign you in.</p>
        <PrimaryButton type="button" onClick={() => openSignIn()}>Sign in</PrimaryButton>
      </Shell>
    )
  }
  if (isGuest) {
    return <Shell><h1 className={title}>Students only</h1><p className="opacity-80">The studio is for Babson, Olin and Wellesley students.</p></Shell>
  }
  return (
    <Shell>
      {state === 'done' ? (
        <>
          <h1 className={title}>Hi {name}</h1>
          <p className="text-xl">Look at the studio screen. You’ll be signed in in a few seconds.</p>
          <p className="opacity-70">If someone else is using the booth, they need to sign out first.</p>
          <GhostButton type="button" className="underline" onClick={() => { started.current = true; void send() }}>Scan didn’t work? Try again</GhostButton>
        </>
      ) : state === 'error' ? (
        <>
          <h1 className={title}>Couldn’t sign you in</h1>
          <p className="text-lg">{error}</p>
          <PrimaryButton type="button" onClick={() => void send()}>Try again</PrimaryButton>
        </>
      ) : <p className="text-xl opacity-80">Signing you in at the studio…</p>}
    </Shell>
  )
}
