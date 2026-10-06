'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import {
  api, clearPendingGuest, completeGuestLink, isGuestLink, readPendingGuest, sendGuestLink, signOut,
} from '@/lib/auth'
import { Card, ErrorText, Field, GhostButton, PrimaryButton } from '@/components/AuthUI'

export default function GuestPage() {
  const { user, loading, isBabson, guestPass, hasMemberAccess } = useAuth()
  const [stage, setStage] = useState<'form' | 'sent' | 'confirm-email'>('form')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sponsorEmail, setSponsorEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [requests, setRequests] = useState<{ id: string; status: string }[]>([])
  const finishing = useRef(false)

  // Returning from the emailed sign-in link.
  useEffect(() => {
    if (loading || user || finishing.current || !isGuestLink(window.location.href)) return
    finishing.current = true
    const pending = readPendingGuest()
    if (!pending) { queueMicrotask(() => setStage('confirm-email')); return }
    finish(pending.email, pending.name, pending.sponsorEmail)
  }, [loading, user])

  async function finish(em: string, nm: string, sponsor: string) {
    setBusy(true); setError('')
    try {
      await completeGuestLink(em, window.location.href)
      const claim = await api<{ granted: boolean }>('/api/guest/claim', {})
      if (!claim.granted && sponsor) await api('/api/guest/request', { sponsorEmail: sponsor, name: nm })
      clearPendingGuest()
      window.history.replaceState({}, '', '/auth/guest')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That link is invalid or expired. Request a new one.')
      setStage('form')
    }
    setBusy(false)
  }

  // Live status of this guest's requests.
  useEffect(() => {
    if (!user || isBabson) return
    return onSnapshot(
      query(collection(db, 'guestRequests'), where('guestUid', '==', user.uid)),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, status: d.get('status') }))),
      () => {},
    )
  }, [user, isBabson])

  async function send(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      await sendGuestLink(email, name.trim() || 'Guest', sponsorEmail)
      setStage('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.')
    }
    setBusy(false)
  }

  if (loading || busy && !user) {
    return <div className="flex justify-center py-24"><div className="w-6 h-6 border-2 border-br-gold border-t-transparent rounded-full animate-spin" /></div>
  }

  // Signed in as Babson → nothing to do here.
  if (user && isBabson) {
    return <Card title="YOU'RE A STUDENT"><p className="text-center text-sm text-br-dk-sub">
      Babson accounts have full access. <Link href="/" className="text-br-gold">Go listen</Link>.</p></Card>
  }

  // Signed-in guest: pass status.
  if (user) {
    const latest = requests[requests.length - 1]
    return (
      <Card title="GUEST ACCESS">
        <div className="bg-br-dk-surface border border-br-dk-border rounded-2xl p-6 text-center space-y-3">
          {hasMemberAccess && guestPass ? (
            <>
              <p className="text-br-dk-text">Access granted by {guestPass.sponsorName}.</p>
              <p className="text-br-dk-sub text-sm">Expires {new Date(guestPass.expiresAt).toLocaleString()}.</p>
              <Link href="/" className="inline-block font-display tracking-widest text-sm text-br-gold">START LISTENING →</Link>
            </>
          ) : latest?.status === 'pending' ? (
            <p className="text-br-dk-sub text-sm">Waiting for your Babson contact to approve. This page updates automatically.</p>
          ) : latest?.status === 'denied' ? (
            <p className="text-br-red text-sm">That request wasn&apos;t approved.</p>
          ) : guestPass ? (
            <p className="text-br-dk-sub text-sm">Your guest pass has ended. Ask a Babson student for a new one.</p>
          ) : (
            <p className="text-br-dk-sub text-sm">No access yet. Ask a Babson student to approve or invite you.</p>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="text-center mt-6"><GhostButton onClick={() => signOut()}>SIGN OUT</GhostButton></div>
      </Card>
    )
  }

  if (stage === 'sent') {
    return (
      <Card title="CHECK YOUR EMAIL" subtitle={`We sent a sign-in link to ${email}. Open it on this device.`}>
        <div className="text-center"><GhostButton onClick={() => setStage('form')}>USE A DIFFERENT EMAIL</GhostButton></div>
      </Card>
    )
  }

  if (stage === 'confirm-email') {
    return (
      <Card title="CONFIRM YOUR EMAIL" subtitle="Opened the link on a different device? Enter the email it was sent to.">
        <form onSubmit={e => { e.preventDefault(); finish(email, name, '') }} className="space-y-4">
          <Field label="Your email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          <PrimaryButton type="submit" busy={busy}>CONTINUE</PrimaryButton>
        </form>
      </Card>
    )
  }

  return (
    <Card title="GUEST ACCESS" subtitle="Locked content is for Babson students. A student can sponsor you for a limited time.">
      <form onSubmit={send} className="space-y-4">
        <Field label="Your name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="First name" />
        <Field label="Your email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
        <Field label="Babson student's email (blank if already invited)" type="email" value={sponsorEmail} onChange={e => setSponsorEmail(e.target.value)} placeholder="friend@babson.edu" />
        <p className="text-xs text-br-dk-sub">
          We&apos;ll email you a sign-in link and ask that student to approve you. If a student already invited you, leave the student field blank.
        </p>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy}>EMAIL ME A LINK</PrimaryButton>
      </form>
      <p className="text-center text-sm text-br-dk-sub mt-8">
        Babson student? <Link href="/auth" className="text-br-gold hover:underline">Sign in</Link>
      </p>
    </Card>
  )
}
