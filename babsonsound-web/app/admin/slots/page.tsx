'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/auth'
import { SLOT_TYPES, type SlotType } from '@/lib/slots'
import { ErrorText } from '@/components/AuthUI'

interface Req {
  id: string; requesterName: string; requesterEmail: string; title: string; description: string; location?: string
  type: SlotType; category: string; audioURL: string; startAt: number; endAt: number; durationMin: number
}
interface Slot { id: string; title: string; hostName: string; type: SlotType; startAt: number; endAt: number }

const fmt = (ms: number) =>
  new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function AdminSlotsPage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [pending, setPending] = useState<Req[]>([])
  const [upcoming, setUpcoming] = useState<Slot[]>([])
  const [error, setError] = useState('')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (!loading && (!user || !isDirector)) router.replace('/')
  }, [loading, user, isDirector, router])

  useEffect(() => {
    if (!user || !isDirector) return
    const u1 = onSnapshot(query(collection(db, 'slotRequests'), where('status', '==', 'pending')),
      s => setPending(s.docs.map(d => ({
        id: d.id, requesterName: d.get('requesterName'), requesterEmail: d.get('requesterEmail'),
        title: d.get('title'), description: d.get('description'), location: d.get('location') ?? '', type: d.get('type'),
        category: d.get('category'), audioURL: d.get('audioURL') ?? '',
        startAt: d.get('startAt').toMillis(), endAt: d.get('endAt').toMillis(), durationMin: d.get('durationMin'),
      })).sort((a, b) => a.startAt - b.startAt)),
      e => setError(e.message))
    const u2 = onSnapshot(collection(db, 'airSlots'),
      s => setUpcoming(s.docs.map(d => ({
        id: d.id, title: d.get('title'), hostName: d.get('hostName'), type: d.get('type'),
        startAt: d.get('startAt').toMillis(), endAt: d.get('endAt').toMillis(),
      })).filter(x => x.endAt > now).sort((a, b) => a.startAt - b.startAt)),
      e => setError(e.message))
    return () => { u1(); u2() }
  }, [user, isDirector, now])

  if (!user || !isDirector) return null

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">SLOT REQUESTS</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <ErrorText>{error}</ErrorText>

      <section className="space-y-3">
        <h2 className="font-display text-br-gold tracking-widest text-sm">PENDING ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-br-dk-sub">Nothing waiting.</p>}
        {pending.map(r => <PendingCard key={r.id} r={r} onError={setError} />)}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-br-gold tracking-widest text-sm">BOOKED ({upcoming.length})</h2>
        {upcoming.length === 0 && <p className="text-sm text-br-dk-sub">Nothing booked yet.</p>}
        {upcoming.map(s => (
          <div key={s.id} className="sk-raised rounded-xl px-4 py-3 flex justify-between gap-4">
            <div>
              <p className="text-sm text-br-dk-text">{s.title} <span className="text-br-dk-sub">· {s.hostName}</span></p>
              <p className="text-xs text-br-dk-sub">{SLOT_TYPES[s.type]}</p>
            </div>
            <p className="text-xs text-br-dk-sub text-right">{fmt(s.startAt)}<br />→ {fmt(s.endAt)}</p>
          </div>
        ))}
      </section>
    </div>
  )
}

function PendingCard({ r, onError }: { r: Req; onError: (m: string) => void }) {
  const [note, setNote] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function decide(action: 'approve' | 'decline') {
    setBusy(true); onError('')
    try { await api('/api/slots/decision', { requestId: r.id, action, note, connectionInfo: info }) }
    catch (e) { onError(e instanceof Error ? e.message : 'Something went wrong.') }
    setBusy(false)
  }

  const box = 'w-full bg-br-dk-surface2 border border-br-dk-border rounded-lg px-3 py-2 text-sm text-br-dk-text placeholder:text-br-dk-muted'
  return (
    <div className="sk-raised rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="text-br-dk-text">{r.title}</p>
          <p className="text-xs text-br-dk-sub">{r.requesterName} · {r.requesterEmail} · {SLOT_TYPES[r.type]} · {r.category}</p>
        </div>
        <p className="text-sm text-br-gold text-right">{fmt(r.startAt)}<br /><span className="text-xs text-br-dk-sub">{r.durationMin} min</span></p>
      </div>
      {r.description && <p className="text-sm text-br-dk-sub whitespace-pre-wrap">{r.description}</p>}
      {r.location && <p className="text-sm text-br-dk-text">Special request / location: {r.location}</p>}
      {r.audioURL && (
        <a href={r.audioURL} target="_blank" rel="noopener noreferrer" className="text-sm text-br-gold hover:underline break-all">{r.audioURL}</a>
      )}
      <input className={box} placeholder="Note to requester (optional)" value={note} onChange={e => setNote(e.target.value)} />
      <textarea className={box} rows={2} value={info} onChange={e => setInfo(e.target.value)}
        placeholder={r.type === 'live' ? 'Live-stream details to send them on approval (server, port, login, arrive-by time)…' : 'Instructions for them (optional)…'} />
      <div className="flex gap-3">
        <button disabled={busy} onClick={() => decide('approve')}
          className="font-display tracking-widest text-xs sk-btn px-5 py-2.5 rounded-lg disabled:opacity-50">APPROVE</button>
        <button disabled={busy} onClick={() => decide('decline')}
          className="font-display tracking-widest text-xs text-br-red px-3 py-2.5 disabled:opacity-50">DECLINE</button>
      </div>
    </div>
  )
}
