'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { isBabsonEmail, requestEmailLink, signIn, signUp, signOut, resendVerification, sendPasswordReset } from '@/lib/auth'
import { useResetCooldown, mmss } from '@/lib/useResetCooldown'
import { Card, ErrorText, Field, GhostButton, PrimaryButton } from '@/components/AuthUI'

export default function AuthPage() {
  const { user, loading, needsVerification, reload } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !needsVerification) router.replace('/')
  }, [loading, user, needsVerification, router])

  if (loading) return <Spinner />
  if (user && needsVerification) return <VerifyPanel email={user.email!} onCheck={reload} />
  if (user) return <Spinner />
  return <Forms />
}

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-br-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// Email and password is the default: no name, phone or graduation year (asked later on the profile page).
// "Email me a link instead" signs in without a password, for anyone who would rather not make one.
function Forms() {
  const [usePassword, setUsePassword] = useState(true)
  const [create, setCreate] = useState(false) // new account instead of sign in
  const [typed, setTyped] = useState('')
  const email = typed.trim().toLowerCase().replace(/\s/g, '')
  const [password, setPassword] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0) // seconds until another link can be requested
  const [resetBump, setResetBump] = useState(0)
  const resetLeft = useResetCooldown(email, resetBump)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(w => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  // The countdown page's Sign up button links here with ?mode=create.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('mode') === 'create') queueMicrotask(() => setCreate(true))
  }, [])

  async function sendLink(e?: React.FormEvent) {
    e?.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    setBusy(true)
    try { await requestEmailLink(email); setSentTo(email); setWait(45) }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try { if (create) await signUp(email, password); else await signIn(email, password) }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }

  if (sentTo) {
    return (
      <Card title="Check your email" subtitle={`We sent a sign-in link to ${sentTo}. Tap it and you're in.`}>
        <div className="space-y-3">
          <p className="text-center text-sm text-br-dk-sub">Nothing yet? Check your spam folder.</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-between">
            <GhostButton disabled={wait > 0 || busy} onClick={() => sendLink()}>{wait > 0 ? `Resend in ${wait}s` : 'Resend link'}</GhostButton>
            <GhostButton onClick={() => { setSentTo(''); setError('') }}>Use a different email</GhostButton>
          </div>
        </div>
      </Card>
    )
  }

  const hint = !email ? '' : isBabsonEmail(email) ? "You'll join as a Student." : 'Guest account: live radio only.'

  return (
    <Card title="Babson Radio" subtitle="Student radio — Babson College">
      <form onSubmit={usePassword ? submitPassword : sendLink} className="space-y-4">
        <Field label="Email" value={typed} onChange={e => setTyped(e.target.value)} type="email"
               autoComplete="username" autoCapitalize="none" placeholder="you@babson.edu" />
        {hint && <p className="text-sm text-br-dk-sub -mt-2">{hint}</p>}
        {usePassword && (
          <Field label="Password" value={password} onChange={e => setPassword(e.target.value)}
                 type="password" autoComplete={create ? 'new-password' : 'current-password'}
                 placeholder={create ? 'At least 8 characters' : 'Password'} />
        )}
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy}>
          {!usePassword ? 'EMAIL ME A LINK' : create ? 'CREATE ACCOUNT' : 'SIGN IN'}
        </PrimaryButton>
        <p className="text-center text-sm text-br-dk-sub">
          By continuing you agree to the{' '}
          <Link href="/terms" target="_blank" className="underline underline-offset-4">Terms of Use</Link> and{' '}
          <Link href="/privacy" target="_blank" className="underline underline-offset-4">Privacy Policy</Link>.
          {' '}We&apos;ll email you when we launch.
        </p>
        <div className="flex flex-col items-center gap-2 text-sm text-br-dk-sub">
          {usePassword && (
            <button type="button" className="hover:text-br-dk-text" onClick={() => { setCreate(v => !v); setError('') }}>
              {create ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          )}
          <button type="button" className="hover:text-br-dk-text underline underline-offset-4"
                  onClick={() => { setUsePassword(v => !v); setError('') }}>
            {usePassword ? 'Email me a link instead' : 'Use a password instead'}
          </button>
          {usePassword && !create && (
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
    </Card>
  )
}

function VerifyPanel({ email, onCheck }: { email: string; onCheck: () => Promise<void> }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // Re-check when the user comes back from their inbox.
  useEffect(() => {
    const f = () => { onCheck().catch(() => {}) }
    window.addEventListener('focus', f)
    return () => window.removeEventListener('focus', f)
  }, [onCheck])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg('')
    try { await fn(); setMsg(ok) } catch (e) { setMsg(e instanceof Error ? e.message : 'Try again in a minute.') }
    setBusy(false)
  }

  return (
    <Card title="Verify your email" subtitle={`We sent a link to ${email}. Open it, then come back here.`}>
      <div className="space-y-3">
        <PrimaryButton busy={busy} onClick={() => run(onCheck, 'Click the link in your email first.')}>
          I&apos;VE VERIFIED
        </PrimaryButton>
        <div className="flex justify-between">
          <GhostButton onClick={() => run(resendVerification, 'Sent again. Check your inbox and spam.')}>Resend email</GhostButton>
          <GhostButton onClick={() => signOut()}>Sign out</GhostButton>
        </div>
        {msg && <p className="text-center text-sm text-br-dk-sub">{msg}</p>}
        <p className="text-center text-sm text-br-dk-sub">Check your spam folder.</p>
      </div>
    </Card>
  )
}
