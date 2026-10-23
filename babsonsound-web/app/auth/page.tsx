'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { gradYearOptions } from '@/lib/terms'
import { isBabsonEmail, signIn, signUp, signOut, resendVerification, sendPasswordReset } from '@/lib/auth'
import { useResetCooldown, mmss } from '@/lib/useResetCooldown'
import { normalizeUS } from '@/lib/phone'
import { AgreeBox, Card, ErrorText, Field, GhostButton, PrimaryButton, formatPhone } from '@/components/AuthUI'

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

function Forms() {
  const [mode, setMode] = useState<'signin' | 'create'>('signin')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  // The full address, exactly as typed or autofilled (Babson, Olin or Wellesley).
  const [typed, setTyped] = useState('')
  const email = typed.trim().toLowerCase().replace(/\s/g, '')
  const [phone, setPhone] = useState('')
  const [gradYear, setGradYear] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetBump, setResetBump] = useState(0)
  const resetLeft = useResetCooldown(email, resetBump)

  // The countdown page's Sign up button links here with ?mode=create.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('mode') === 'create') queueMicrotask(() => setMode('create'))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'create') {
      if (!firstName.trim()) return setError('Enter your first name.')
      if (!lastName.trim()) return setError('Enter your last name.')
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.')
      if (!normalizeUS(phone)) return setError('Enter a valid 10-digit US phone number.')
      if (isBabsonEmail(email) && !gradYear) return setError('Pick your graduation year.')
      if (!agreed) return setError('Agree to the Terms of Use and Privacy Policy to create an account.')
      if (password.length < 8) return setError('Password must be at least 8 characters.')
    }
    setBusy(true)
    try {
      if (mode === 'create') await signUp(email, password, firstName.trim(), lastName.trim(), phone, isBabsonEmail(email) ? gradYear : '')
      else await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Babson Radio" subtitle="Student radio — Babson College">
      <div className="grid grid-cols-2 sk-field rounded-xl p-1 mb-6">
        {(['signin', 'create'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError('') }}
            className={`font-display tracking-widest text-sm py-2 rounded-lg transition-colors ${
              mode === m ? 'bg-br-gold text-br-dk-bg' : 'text-br-dk-sub hover:text-br-dk-text'
            }`}
          >
            {m === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === 'create' && (
          <>
            <Field label="First name" value={firstName} onChange={e => setFirstName(e.target.value)}
                   autoComplete="given-name" placeholder="First name" />
            <Field label="Last name" value={lastName} onChange={e => setLastName(e.target.value)}
                   autoComplete="family-name" placeholder="Last name" />
            <Field label="Phone number" value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                   type="tel" autoComplete="tel-national" inputMode="tel" placeholder="(555) 555-5555" />
          </>
        )}
        <Field label="Email" value={typed} onChange={e => setTyped(e.target.value)} type="email"
               autoComplete="username" autoCapitalize="none" placeholder="you@babson.edu" />
        {mode === 'create' && (
          <p className="text-xs text-br-dk-sub -mt-2">
            {isBabsonEmail(email) ? 'You will join as a Student.' : 'Babson, Olin or Wellesley email: Student. Any other email: Guest.'}
          </p>
        )}
        {mode === 'create' && isBabsonEmail(email) && (
          <label className="block">
              <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">Graduation year</span>
              <select value={gradYear} onChange={e => setGradYear(e.target.value)}
                      className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none">
                <option value="">Select</option>
                {gradYearOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
        )}
        <Field label="Password" value={password} onChange={e => setPassword(e.target.value)}
               type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
               placeholder={mode === 'create' ? 'At least 8 characters' : 'Password'} />
        {mode === 'create' && <AgreeBox checked={agreed} onChange={setAgreed} />}
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy}>{mode === 'create' ? 'CREATE ACCOUNT' : 'SIGN IN'}</PrimaryButton>
        {mode === 'create' && (
          <p className="text-center text-xs text-br-dk-sub">
            <Link href="/privacy" target="_blank" className="underline underline-offset-4">We&apos;ll email you when we launch.</Link>
          </p>
        )}
        {mode === 'signin' && (
          <button type="button" disabled={resetLeft > 0} className="block mx-auto text-sm text-br-dk-sub hover:text-br-dk-text disabled:opacity-60 disabled:hover:text-br-dk-sub"
            onClick={async () => {
              if (!email) return setError('Enter your email above first.')
              try { await sendPasswordReset(email); setError('If that account exists, a reset link is on its way.') }
              catch (e) { setError(e instanceof Error ? e.message : 'Try again in a moment.') }
              setResetBump(n => n + 1)
            }}>{resetLeft > 0 ? `Resend in ${mmss(resetLeft)}` : 'Forgot password?'}</button>
        )}
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
        <PrimaryButton busy={busy} onClick={() => run(onCheck, 'Still waiting — click the link in the email first.')}>
          I&apos;VE VERIFIED
        </PrimaryButton>
        <div className="flex justify-between">
          <GhostButton onClick={() => run(resendVerification, 'Sent again. Check your inbox and spam.')}>Resend email</GhostButton>
          <GhostButton onClick={() => signOut()}>Sign out</GhostButton>
        </div>
        {msg && <p className="text-center text-sm text-br-dk-sub">{msg}</p>}
        <p className="text-center text-xs text-br-dk-sub">Check your spam folder.</p>
      </div>
    </Card>
  )
}
