'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/auth'
import { openSignIn } from '@/lib/signInPrompt'

// The page the QR code on the studio door opens (babsonradio.com/booth/door). Signed in already (website, or the app opens this link itself):
// it asks the studio PC to sign you in, and that is all. Signed out: sign in here, and it carries on.

type State = 'wait' | 'sending' | 'done' | 'error'

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

  const box = 'min-h-dvh grid place-items-center px-6 text-center'
  if (loading) return <div className={box}><p className="text-xl opacity-70">One moment…</p></div>
  if (!user) {
    return (
      <div className={box}><div className="space-y-5 max-w-sm">
        <h1 className="font-display text-3xl">Studio sign-in</h1>
        <p className="opacity-80">Sign in to Babson Radio and the studio computer will sign you in.</p>
        <button type="button" className="px-6 h-12 rounded-lg bg-br-gold text-black font-semibold" onClick={() => openSignIn()}>Sign in</button>
      </div></div>
    )
  }
  if (isGuest) {
    return <div className={box}><div className="space-y-3 max-w-sm"><h1 className="font-display text-3xl">Students only</h1><p className="opacity-80">The studio is for Babson, Olin and Wellesley students.</p></div></div>
  }
  return (
    <div className={box}>
      <div className="space-y-4 max-w-sm">
        {state === 'done' ? (
          <>
            <h1 className="font-display text-3xl">Hi {name}</h1>
            <p className="text-xl">Look at the studio screen. You’ll be signed in in a few seconds.</p>
            <p className="opacity-70">If someone else is using the booth, they need to sign out first.</p>
            <button type="button" className="underline opacity-80" onClick={() => { started.current = true; void send() }}>Scan didn’t work? Try again</button>
          </>
        ) : state === 'error' ? (
          <>
            <h1 className="font-display text-3xl">Couldn’t sign you in</h1>
            <p className="text-lg">{error}</p>
            <button type="button" className="px-6 h-12 rounded-lg bg-br-gold text-black font-semibold" onClick={() => void send()}>Try again</button>
          </>
        ) : <p className="text-xl opacity-80">Signing you in at the studio…</p>}
      </div>
    </div>
  )
}
