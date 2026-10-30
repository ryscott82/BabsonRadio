'use client'

import FilterBar, { MoreButton, useFilter, usePaged } from '@/components/admin/FilterBar'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface Row {
  id: string; name: string; email: string; level: string; startedAt: number; lastSeenAt: number; endedAt: number
  endReason: string; liveCount: number; songCount: number; onAirMs: number; live: boolean
}
interface Ev { id: string; kind: string; text: string; at: number }

const when = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const mins = (ms: number) => (ms < 60_000 ? (ms ? '<1 min' : '—') : `${Math.round(ms / 60_000)} min`)
const KIND: Record<string, string> = {
  sign_in: 'Signed in', live_start: 'Went live', live_stop: 'Ended stream', song: 'Song', sign_out: 'Signed out', idle_out: 'Signed out (idle)',
}
const ended = (r: Row) => r.endedAt ? `${time(r.endedAt)}${r.endReason === 'idle_out' ? ' (idle)' : ''}` : Date.now() - r.lastSeenAt < 6 * 60_000 ? 'Signed in now' : `Last seen ${time(r.lastSeenAt)}`
const textOf = (r: Row) => `${r.name} ${r.email} ${r.level} ${when(r.startedAt)}`

export default function AdminBoothPage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [events, setEvents] = useState<Record<string, Ev[]>>({})
  const [error, setError] = useState('')

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace('/') }, [loading, user, isDirector, router])
  const load = useCallback(() => {
    apiGet<{ sessions: Row[] }>('/api/admin/booth').then(r => { setRows(r.sessions); setError('') }).catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [])
  useEffect(() => { if (user && isDirector) queueMicrotask(load) }, [user, isDirector, load])

  const toggle = (id: string) => {
    setOpen(o => (o === id ? null : id))
    if (!events[id]) apiGet<{ events: Ev[] }>(`/api/admin/booth?sessionId=${encodeURIComponent(id)}`).then(r => setEvents(x => ({ ...x, [id]: r.events }))).catch(() => {})
  }

  const f = useFilter(rows, textOf)
  const paged = usePaged(f.items)
  if (!user || !isDirector) return null
  return (
    <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Studio PC log</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <button type="button" onClick={load} className="ops-btn">Refresh</button>
      </div>
      <p className="text-sm text-br-dk-sub">Everyone who signed in on the studio PC, newest first. Click a row for what they did.</p>
      <ErrorText>{error}</ErrorText>
      <FilterBar f={f} total={rows.length} placeholder="Search name, email or date" />
      <div className="sk-raised rounded-xl divide-y divide-br-dk-border text-sm">
        <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_0.7fr_0.6fr_1fr] gap-3 px-4 py-2 text-br-dk-sub">
          <span>Person</span><span>Signed in</span><span>Signed out</span><span>On air</span><span>Songs</span><span>Role</span>
        </div>
        {paged.items.map(r => (
          <div key={r.id}>
            <button type="button" onClick={() => toggle(r.id)} className="w-full text-left grid md:grid-cols-[1.4fr_1fr_1fr_0.7fr_0.6fr_1fr] gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-br-dk-surface2">
              <span className="text-br-dk-text truncate">{r.name}{r.live && <span className="ml-2 text-br-red">● live</span>}<span className="block text-xs text-br-dk-sub truncate">{r.email}</span></span>
              <span className="text-br-dk-sub tabular-nums">{when(r.startedAt)}</span>
              <span className="text-br-dk-sub tabular-nums">{ended(r)}</span>
              <span className="text-br-dk-sub tabular-nums">{mins(r.onAirMs)}</span>
              <span className="text-br-dk-sub tabular-nums">{r.songCount || '—'}</span>
              <span className="text-br-dk-sub capitalize">{r.level}</span>
            </button>
            {open === r.id && (
              <div className="px-6 pb-3 space-y-1">
                {!events[r.id] && <p className="text-br-dk-sub">Loading…</p>}
                {events[r.id]?.map(e => (
                  <div key={e.id} className="flex gap-4">
                    <span className="text-br-dk-sub tabular-nums w-20 shrink-0">{time(e.at)}</span>
                    <span className="text-br-dk-text">{KIND[e.kind] ?? e.kind}{e.text ? `: ${e.text}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!rows.length && !error && <p className="px-4 py-3 text-br-dk-sub">Nobody has signed in on the studio PC yet.</p>}
      </div>
      <MoreButton p={paged} />
    </div>
  )
}
