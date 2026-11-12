'use client'

import FilterBar, { MoreButton, useFilter, usePaged } from '@/components/admin/FilterBar'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import type { AdPlan } from '@/lib/booth'
import { ErrorText } from '@/components/AuthUI'

interface Row {
  id: string; name: string; email: string; level: string; startedAt: number; lastSeenAt: number; endedAt: number
  endReason: string; liveCount: number; songCount: number; musicCount: number; onAirMs: number; live: boolean
}
interface Ev { id: string; kind: string; text: string; at: number }

const when = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const mins = (ms: number) => (ms < 60_000 ? (ms ? '<1 min' : '—') : `${Math.round(ms / 60_000)} min`)
const KIND: Record<string, string> = {
  sign_in: 'Signed in', live_start: 'Went live', live_stop: 'Ended stream', song: 'Song', music: 'Background music', note: 'Left a note', sign_out: 'Signed out', idle_out: 'Signed out (idle)',
}
const ended = (r: Row) => r.endedAt ? `${time(r.endedAt)}${r.endReason === 'idle_out' ? ' (idle)' : ''}` : Date.now() - r.lastSeenAt < 6 * 60_000 ? 'Signed in now' : `Last seen ${time(r.lastSeenAt)}`
const textOf = (r: Row) => `${r.name} ${r.email} ${r.level} ${when(r.startedAt)}`

export default function AdminBoothPage() {
  const { user, isDirector, isAdmin, loading } = useAuth()
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
    <div className="px-5 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Studio PC log</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <button type="button" onClick={load} className="ops-btn">Refresh</button>
      </div>
      {isAdmin && <AdBreaks />}
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
              <span className="text-br-dk-sub tabular-nums">{r.songCount + r.musicCount || '—'}</span>
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

/** Ad break times shown as a countdown on the studio PC. */
function AdBreaks() {
  const [plan, setPlan] = useState<AdPlan | null>(null)
  const [minutes, setMinutes] = useState('')
  const [length, setLength] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    apiGet<{ ads: AdPlan }>('/api/admin/booth?ads=1').then(r => { setPlan(r.ads); setMinutes(r.ads.minutes.join(', ')); setLength(String(r.ads.lengthSec / 60)) }).catch(() => setMsg('Could not load ad breaks.'))
  }, [])
  if (!plan) return msg ? <p className="text-sm text-br-red">{msg}</p> : null
  const save = async (enabled: boolean) => {
    setMsg('')
    try {
      const r = await api<{ ads: AdPlan }>('/api/admin/booth', { ads: { enabled, minutes: minutes.split(/[\s,]+/).filter(Boolean).map(Number), lengthSec: Math.round(Number(length) * 60) } })
      setPlan(r.ads); setMinutes(r.ads.minutes.join(', ')); setLength(String(r.ads.lengthSec / 60)); setMsg('Saved.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.') }
  }
  return (
    <div className="sk-raised rounded-xl p-4 space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <h2 className="text-lg text-br-dk-text">Ad breaks</h2>
        <span className="text-br-dk-sub">{plan.enabled ? 'On: hosts see a countdown on the studio PC' : 'Off'}</span>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1"><span className="block text-br-dk-sub">Minutes past each hour</span>
          <input value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="20, 50" className="sk-field rounded px-3 py-2 w-40" /></label>
        <label className="space-y-1"><span className="block text-br-dk-sub">Length (minutes)</span>
          <input value={length} onChange={e => setLength(e.target.value)} inputMode="decimal" className="sk-field rounded px-3 py-2 w-24" /></label>
        <button type="button" className="ops-btn" onClick={() => save(plan.enabled)}>Save</button>
        <button type="button" className="ops-btn" onClick={() => save(!plan.enabled)}>{plan.enabled ? 'Turn off' : 'Turn on'}</button>
        {msg && <span className="text-br-dk-sub">{msg}</span>}
      </div>
    </div>
  )
}
