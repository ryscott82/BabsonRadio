'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isBabsonEmail, signIn, signUp, sendPasswordReset } from '@/lib/auth'
import { useResetCooldown, mmss } from '@/lib/useResetCooldown'
import Turnstile from '@/components/Turnstile'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'

// Email and password only. Nothing else is asked here: name, avatar, birthday and the rest come later, one step at a time.
export default function SignInForm({ initialCreate = false }: { initialCreate?: boolean }) {
  const [create, setCreate] = useState(initialCreate) // new account instead of sign in
  const [typed, setTyped] = useState('')
  const email = typed.trim().toLowerCase().replace(/\s/g, '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetBump, setResetBump] = useState(0)
  // Only shown when the server asks for a quick check (BR-ACC-022): several sign-ups from one place, or a busy moment.
  const [needCheck, setNeedCheck] = useState(false)
  const [checkToken, setCheckToken] = useState('')
  const resetLeft = useResetCooldown(email, resetBump)

  // Links with ?mode=create open the sign-up form.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('mode') === 'create') queueMicrotask(() => setCreate(true))
  }, [])

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try { if (create) await signUp(email, password, '', '', '', '', checkToken); else await signIn(email, password) }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      if (msg.includes('BR-ACC-022')) setNeedCheck(true)
      setCheckToken('')
      setError(msg)
    }
    finally { setBusy(false) }
  }

  const hint = !email ? '' : isBabsonEmail(email) ? "You'll join as a Student." : 'Guest account: live radio only.'

  return (
    <form onSubmit={submitPassword} className="space-y-4">
        <Field label="Email" value={typed} onChange={e => setTyped(e.target.value)} type="email"
               autoComplete="username" autoCapitalize="none" placeholder="you@babson.edu" />
        {hint && <p className="text-sm text-br-dk-sub -mt-2">{hint}</p>}
        <Field label="Password" value={password} onChange={e => setPassword(e.target.value)}
               type="password" autoComplete={create ? 'new-password' : 'current-password'}
               placeholder={create ? 'At least 8 characters' : 'Password'} />
        {create && needCheck && <Turnstile onToken={setCheckToken} />}
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy}>{create ? 'CREATE ACCOUNT' : 'SIGN IN'}</PrimaryButton>
        <p className="text-center text-sm text-br-dk-sub">
          By continuing you agree to the{' '}
          <Link href="/terms" target="_blank" className="underline underline-offset-4">Terms of Use</Link> and{' '}
          <Link href="/privacy" target="_blank" className="underline underline-offset-4">Privacy Policy</Link>.
          {' '}We&apos;ll email you when we launch.
        </p>
        <div className="flex flex-col items-center gap-2 text-sm text-br-dk-sub">
          <button type="button" className="hover:text-br-dk-text" onClick={() => { setCreate(v => !v); setError('') }}>
            {create ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
          {!create && (
            <button type="button" disabled={resetLeft > 0} className="hover:text-br-dk-text disabled:opacity-60"
              onClick={async () => {
                if (!email) return setError('Enter your email above first.')
                try { await sendPasswordReset(email); setError('Reset link sent if the account exists.') }
                catch (e) { setError(e instanceof Error ? e.message : 'Try again in a moment.') }
                setResetBump(n => n + 1)
              }}>{resetLeft > 0 ? `Resend in ${mmss(resetLeft)}` : 'Forgot password?'}</button>
          )}
        </div>
    </form>
  )
}

