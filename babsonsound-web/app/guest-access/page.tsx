'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/auth'
import { GUEST_DURATIONS, GUEST_DURATION_KEYS, type GuestDuration } from '@/lib/guest'
import { ErrorText, Field } from '@/components/AuthUI'

interface Req { id: string; guestName: string; guestEmail: string; status: string; createdAt: number }
interface Pass { guestUid: string; guestEmail: string; expiresAt: number; revoked: boolean }

export default function GuestAccessPage() {
  const { user, isBabson, loading } = useAuth()
  const router = useRouter()
  const [requests, setRequests] = useState<Req[]>([])
  const [passes, setPasses] = useState<Pass[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (!loading && !isBabson) router.replace('/auth')
  }, [loading, isBabson, router])

  useEffect(() => {
    if (!user || !isBabson) return
    const u1 = onSnapshot(query(collection(db, 'guestRequests'), where('sponsorUid', '==', user.uid)),
      s => setRequests(s.docs.map(d => ({
        id: d.id, guestName: d.get('guestName'), guestEmail: d.get('guestEmail'),
        status: d.get('status'), createdAt: d.get('createdAt').toMillis(),
      })).sort((a, b) => b.createdAt - a.createdAt)), () => {})
    const u2 = onSnapshot(query(collection(db, 'guestPasses'), where('sponsorUid', '==', user.uid)),
      s => setPasses(s.docs.map(d => ({
        guestUid: d.id, guestEmail: d.get('guestEmail'),
        expiresAt: d.get('expiresAt').toMillis(), revoked: d.get('revoked') === true,
      })).sort((a, b) => b.expiresAt - a.expiresAt)), () => {})
    return () => { u1(); u2() }
  }, [user, isBabson])

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setError(''); setNotice('')
    try { await fn(); if (ok) setNotice(ok) } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') }
  }

  if (!isBabson) return null
  const pending = requests.filter(r => r.status === 'pending')
  const active = passes.filter(p => !p.revoked && p.expiresAt > now)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Invite friends</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <ErrorText>{error}</ErrorText>
      {notice && <p className="text-br-gold text-sm">{notice}</p>}

      <Section title={`Requests (${pending.length})`}>
        {pending.length === 0 && <Empty>No pending requests.</Empty>}
        {pending.map(r => <RequestRow key={r.id} r={r} run={run} />)}
      </Section>

      <Section title="Invite a friend — they get guest access automatically">
        <InviteForm run={run} />
      </Section>

      <Section title={`Active guests (${active.length})`}>
        {active.length === 0 && <Empty>You aren&apos;t sponsoring anyone right now.</Empty>}
        {active.map(p => (
          <div key={p.guestUid} className="flex items-center justify-between sk-raised rounded-xl px-4 py-3">
            <div>
              <p className="text-sm text-br-dk-text">{p.guestEmail}</p>
              <p className="text-xs text-br-dk-sub">Until {new Date(p.expiresAt).toLocaleString()}</p>
            </div>
            <button onClick={() => run(() => api('/api/guest/revoke', { guestUid: p.guestUid }), 'Access revoked.')}
                    className="font-display tracking-widest text-xs text-br-red hover:underline">Revoke</button>
          </div>
        ))}
      </Section>
    </div>
  )
}

function RequestRow({ r, run }: { r: Req; run: (f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [duration, setDuration] = useState<GuestDuration>('7d')
  return (
    <div className="sk-raised rounded-xl p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-48">
        <p className="text-sm text-br-dk-text">{r.guestName}</p>
        <p className="text-xs text-br-dk-sub">{r.guestEmail}</p>
      </div>
      <DurationSelect value={duration} onChange={setDuration} />
      <button onClick={() => run(() => api('/api/guest/decision', { requestId: r.id, action: 'approve', duration }), 'Approved.')}
              className="font-display tracking-widest text-xs sk-btn px-4 py-2 rounded-lg">Approve</button>
      <button onClick={() => run(() => api('/api/guest/decision', { requestId: r.id, action: 'deny' }))}
              className="font-display tracking-widest text-xs text-br-dk-sub hover:text-br-dk-text">Deny</button>
    </div>
  )
}

function InviteForm({ run }: { run: (f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [duration, setDuration] = useState<GuestDuration>('7d')
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        run(async () => { await api('/api/guest/invite', { guestEmail: email, duration }); setEmail('') },
          `Invited. They get guest access as soon as they sign up with that email — their ${GUEST_DURATIONS[duration].label.toLowerCase()} starts when they sign in.`)
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex-1 min-w-56">
        <Field label="Guest's email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="friend@example.com" required />
      </div>
      <DurationSelect value={duration} onChange={setDuration} />
      <button className="font-display tracking-widest text-xs sk-btn px-4 py-3 rounded-lg">Invite</button>
    </form>
  )
}

function DurationSelect({ value, onChange }: { value: GuestDuration; onChange: (d: GuestDuration) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as GuestDuration)}
            className="bg-br-dk-surface2 border border-br-dk-border rounded-lg px-3 py-3 text-sm text-br-dk-text">
      {GUEST_DURATION_KEYS.map(k => <option key={k} value={k}>{GUEST_DURATIONS[k].label}</option>)}
    </select>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="font-display text-br-gold tracking-widest text-sm">{title.toUpperCase()}</h2>
    {children}
  </section>
)
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-br-dk-sub">{children}</p>
