'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { signIn, signUp, signOut, resendVerification, isBabsonEmail } from '@/lib/auth'
import { normalizeUS } from '@/lib/phone'
import { Card, ErrorText, Field, GhostButton, PrimaryButton, formatPhone } from '@/components/AuthUI'

export default function AuthPage() {
  const { user, loading, isBabson, needsVerification, hasMemberAccess, reload } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && (isBabson || hasMemberAccess)) router.replace('/')
  }, [loading, user, isBabson, hasMemberAccess, router])

  if (loading) return <Spinner />
  if (user && needsVerification) return <VerifyPanel email={user.email!} onCheck={reload} />
  if (user && !isBabson) {
    // Signed in as a guest: send them to the guest page to see request status.
    router.replace('/auth/guest')
    return <Spinner />
  }
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
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'create') {
      if (!firstName.trim()) return setError('Enter your first name.')
      if (!isBabsonEmail(email)) return setError('Babson Radio requires a @babson.edu email address.')
      if (!normalizeUS(phone)) return setError('Enter a valid 10-digit US phone number.')
      if (password.length < 8) return setError('Password must be at least 8 characters.')
    }
    setBusy(true)
    try {
      if (mode === 'create') await signUp(email, password, firstName.trim(), phone)
      else await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="BABSON RADIO" subtitle="Student radio — Babson College">
      <div className="grid grid-cols-2 bg-br-dk-surface border border-br-dk-border rounded-xl p-1 mb-6">
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
            <Field label="Phone number" value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                   type="tel" autoComplete="tel-national" inputMode="tel" placeholder="(555) 555-5555" />
          </>
        )}
        <Field label="Babson email" value={email} onChange={e => setEmail(e.target.value)}
               type="email" autoComplete="email" placeholder="you@babson.edu" />
        <Field label="Password" value={password} onChange={e => setPassword(e.target.value)}
               type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
               placeholder={mode === 'create' ? 'At least 8 characters' : 'Password'} />
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy}>{mode === 'create' ? 'CREATE ACCOUNT' : 'SIGN IN'}</PrimaryButton>
      </form>

      <p className="text-center text-sm text-br-dk-sub mt-8">
        Not a Babson student?{' '}
        <Link href="/auth/guest" className="text-br-gold hover:underline">Request guest access</Link>
      </p>
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
    <Card title="VERIFY YOUR EMAIL" subtitle={`We sent a link to ${email}. Open it, then come back here.`}>
      <div className="space-y-3">
        <PrimaryButton busy={busy} onClick={() => run(onCheck, 'Still waiting — click the link in the email first.')}>
          I&apos;VE VERIFIED
        </PrimaryButton>
        <div className="flex justify-between">
          <GhostButton onClick={() => run(resendVerification, 'Sent again. Check your inbox and spam.')}>RESEND EMAIL</GhostButton>
          <GhostButton onClick={() => signOut()}>SIGN OUT</GhostButton>
        </div>
        {msg && <p className="text-center text-sm text-br-dk-sub">{msg}</p>}
      </div>
    </Card>
  )
}
