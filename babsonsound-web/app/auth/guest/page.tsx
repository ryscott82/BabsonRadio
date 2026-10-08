'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import {
  addSchoolEmail, api, apiGet, deleteMyAccount, guestSignIn, guestSignUp, resendVerification, sendPasswordReset, signOut,
} from '@/lib/auth'
import { gradYearOptions } from '@/lib/terms'
import { AgreeBox, BabsonEmailField, Card, ErrorText, Field, GhostButton, PrimaryButton } from '@/components/AuthUI'

function Spinner() {
  return <div className="flex justify-center py-24"><div className="w-6 h-6 border-2 border-br-gold border-t-transparent rounded-full animate-spin" /></div>
}

export default function GuestPage() {
  const { user, loading, isBabson, isDeveloper, isGuest } = useAuth()
  if (loading) return <Spinner />
  if (user && (isBabson || isDeveloper)) {
    return <Card title="YOU'RE ALL SET"><p className="text-center text-sm text-br-dk-sub">
      Student and developer accounts have full access. <Link href="/" className="text-br-gold">Go listen</Link>.</p></Card>
  }
  if (user && isGuest) return <GuestHome />
  if (user) {
    return <Card title="VERIFY YOUR EMAIL"><p className="text-center text-sm text-br-dk-sub">
      Finish verifying on the <Link href="/auth" className="text-br-gold">student sign-in page</Link>.</p></Card>
  }
  return <GuestForms />
}

function GuestForms() {
  const [mode, setMode] = useState<'create' | 'signin' | 'reset'>('create')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [agreed, setAgreed] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setInfo('')
    if (mode === 'create' && !agreed) return setError('Agree to the Terms of Use and Privacy Policy to continue.')
    setBusy(true)
    try {
      if (mode === 'create') await guestSignUp(email, password, name)
      else if (mode === 'signin') await guestSignIn(email, password)
      else { await sendPasswordReset(email); setInfo('If that account exists, a reset link is on its way.') }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
    setBusy(false)
  }

  return (
    <Card title="GUEST ACCESS" subtitle="Live radio is free for everyone. A Babson student can unlock the Library for you.">
      <form onSubmit={submit} className="space-y-4">
        {mode === 'create' && (
          <Field label="Your name" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" placeholder="First name" />
        )}
        <Field label="Your email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
        {mode !== 'reset' && (
          <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                 autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                 placeholder={mode === 'create' ? 'At least 8 characters' : 'Password'} />
        )}
        {mode === 'create' && <AgreeBox checked={agreed} onChange={setAgreed} />}
        <ErrorText>{error}</ErrorText>
        {info && <p className="text-sm text-br-dk-sub">{info}</p>}
        <PrimaryButton type="submit" busy={busy}>
          {mode === 'create' ? 'CREATE ACCOUNT' : mode === 'signin' ? 'SIGN IN' : 'SEND RESET LINK'}
        </PrimaryButton>
      </form>
      <div className="flex justify-center gap-5 text-sm mt-6">
        {mode !== 'create' && <button className="text-br-gold" onClick={() => { setMode('create'); setError('') }}>Create account</button>}
        {mode !== 'signin' && <button className="text-br-gold" onClick={() => { setMode('signin'); setError('') }}>Sign in</button>}
        {mode !== 'reset' && <button className="text-br-dk-sub hover:text-br-dk-text" onClick={() => { setMode('reset'); setError('') }}>Forgot password?</button>}
      </div>
      <p className="text-center text-sm text-br-dk-sub mt-6">
        Babson student? <Link href="/auth" className="text-br-gold hover:underline">Sign in</Link>
      </p>
    </Card>
  )
}

type Status = { emailVerified: boolean; requestStatus: string | null; canAccessBacklog?: boolean; libraryVia?: 'pass' | 'contacts' | null; libraryUntil?: number | null }

function SchoolEmailForm() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [gradYear, setGradYear] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState(false)

  if (sent) return <p className="text-sm text-br-dk-sub">We sent a link to {email}. Open it, then sign in again with your school email and your same password.</p>
  if (!open) return (
    <div className="rounded-xl border border-br-dk-border p-4 space-y-2">
      <p className="text-sm text-br-dk-text">Are you a Babson, Olin or Wellesley student?</p>
      <p className="text-xs text-br-dk-sub">Add your school email to unlock everything: the Library, ratings, reactions and friends.</p>
      <button className="text-sm text-br-gold" onClick={() => setOpen(true)}>Add my school email</button>
    </div>
  )
  return (
    <form className="space-y-3" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMsg('')
      try { await addSchoolEmail({ email, password: pw, firstName: first, lastName: last, gradYear }); setSent(true) }
      catch (err) { setMsg(err instanceof Error ? err.message : 'Try again.') }
      setBusy(false)
    }}>
      <Field label="School email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@babson.edu" autoComplete="off" />
      <Field label="First name" value={first} onChange={e => setFirst(e.target.value)} autoComplete="given-name" />
      <Field label="Last name" value={last} onChange={e => setLast(e.target.value)} autoComplete="family-name" />
      <select value={gradYear} onChange={e => setGradYear(e.target.value)} className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text">
        <option value="">Graduation year</option>
        {gradYearOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Field label="Your current password" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" />
      {msg && <p className="text-sm text-br-red">{msg}</p>}
      <PrimaryButton type="submit" busy={busy}>SEND CONFIRMATION LINK</PrimaryButton>
    </form>
  )
}

function GuestHome() {
  const { user, guestPass, passActive, hasLibraryAccess, reload } = useAuth()
  const [status, setStatus] = useState<Status | null>(null)
  const [requests, setRequests] = useState<{ id: string; status: string }[]>([])
  const [sponsorEmail, setSponsorEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [delPw, setDelPw] = useState('')
  const [showDelete, setShowDelete] = useState(false)

  const refresh = useCallback(async () => {
    await reload()
    const s = await apiGet<Status>('/api/guest/status').catch(() => null)
    if (s?.emailVerified) await api('/api/guest/claim', {}).catch(() => {}) // redeem any student invite
    setStatus(s)
  }, [reload])

  useEffect(() => { queueMicrotask(() => { refresh() }) }, [refresh])
  useEffect(() => {
    const f = () => { refresh() }
    window.addEventListener('focus', f)
    return () => window.removeEventListener('focus', f)
  }, [refresh])

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'guestRequests'), where('guestUid', '==', user.uid)),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, status: d.get('status') }))),
      () => {},
    )
  }, [user])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg('')
    try { await fn(); setMsg(ok) } catch (e) { setMsg(e instanceof Error ? e.message : 'Try again in a minute.') }
    setBusy(false)
  }

  const verified = user?.emailVerified === true || status?.emailVerified === true
  const latest = requests[requests.length - 1]
  const fmt = (ms: number) => new Date(ms).toLocaleString()

  return (
    <Card title="GUEST ACCESS">
      <div className="bg-br-dk-surface border border-br-dk-border rounded-2xl p-6 text-center space-y-2">
        {passActive && guestPass ? (
          <>
            <p className="text-br-dk-text">Library unlocked by {guestPass.sponsorName}.</p>
            <p className="text-br-dk-sub text-sm">Expires {fmt(guestPass.expiresAt)}.</p>
          </>
        ) : hasLibraryAccess ? (
          <p className="text-br-dk-text">The Library is open for you.</p>
        ) : (
          <p className="text-br-dk-sub text-sm">Ask a Babson student to sponsor you to unlock the Library.</p>
        )}
        <p className="text-br-dk-sub text-xs">Live radio is open to everyone who is signed in.</p>
        <div className="flex justify-center gap-5">
          <Link href="/" className="inline-block font-display tracking-widest text-sm text-br-gold">LISTEN LIVE →</Link>
          {hasLibraryAccess && <Link href="/library" className="inline-block font-display tracking-widest text-sm text-br-gold">LIBRARY →</Link>}
        </div>
      </div>

      <div className="mt-6"><SchoolEmailForm /></div>

      <div className="mt-6 space-y-4">
        {!verified ? (
          <>
            <p className="text-sm text-br-dk-sub">Verify your email to ask a student to sponsor you. We sent a link to {user?.email}.</p>
            <div className="flex gap-3">
              <PrimaryButton busy={busy} onClick={() => run(resendVerification, 'Sent. Check your inbox.')}>RESEND LINK</PrimaryButton>
              <GhostButton onClick={() => run(refresh, 'Checked.')}>I&apos;VE VERIFIED</GhostButton>
            </div>
          </>
        ) : latest?.status === 'pending' ? (
          <p className="text-sm text-br-dk-sub">Waiting for your Babson contact to approve. This updates automatically.</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); run(async () => {
            await api('/api/guest/request', { sponsorEmail: `${sponsorEmail.toLowerCase()}@babson.edu`, name: user?.displayName ?? 'Guest' }); setSponsorEmail('')
          }, 'Request sent.') }} className="space-y-3">
            {latest?.status === 'denied' && <p className="text-br-red text-sm">That request wasn&apos;t approved.</p>}
            <BabsonEmailField label="Ask a Babson student to sponsor you" value={sponsorEmail}
                   onChange={setSponsorEmail} placeholder="their username" />
            <PrimaryButton type="submit" busy={busy}>SEND REQUEST</PrimaryButton>
          </form>
        )}
        {msg && <p className="text-sm text-br-dk-sub">{msg}</p>}
      </div>

      <div className="text-center mt-8 space-y-4">
        <GhostButton onClick={() => signOut()}>SIGN OUT</GhostButton>
        {!showDelete ? (
          <button className="block mx-auto text-xs text-br-dk-sub hover:text-br-red" onClick={() => setShowDelete(true)}>Delete my account</button>
        ) : (
          <form onSubmit={e => { e.preventDefault(); run(() => deleteMyAccount(delPw), '') }} className="space-y-3 text-left">
            <Field label="Enter your password to permanently delete your account" type="password" value={delPw}
                   onChange={e => setDelPw(e.target.value)} autoComplete="current-password" />
            <PrimaryButton type="submit" busy={busy}>DELETE FOREVER</PrimaryButton>
          </form>
        )}
      </div>
    </Card>
  )
}
