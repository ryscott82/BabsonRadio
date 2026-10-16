'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { plexMono } from '@/components/admin/opsFont'

interface Row {
  uid: string; name: string; email: string; role: string; trained: boolean; certifiedAt: number | null; certifiedBy: string
  score: number | null; attempts: number; requestedAt: number | null; requestNote: string; conductSigned: boolean
}
type Filter = 'all' | 'trained' | 'untrained' | 'requested'

// Look anyone up and see at a glance whether they are certified to host.
export default function AdminTrainingPage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace('/') }, [loading, user, isDirector, router])
  const load = useCallback(async () => {
    try { setRows((await apiGet<{ users: Row[] }>('/api/admin/training')).users) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.') }
  }, [])
  useEffect(() => { if (user && isDirector) queueMicrotask(load) }, [user, isDirector, load])

  async function act(uid: string, action: 'certify' | 'revoke' | 'clearRequest') {
    setBusy(uid); setError('')
    try { await api('/api/admin/training', { uid, action }); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setBusy('')
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter(r => (!t || r.name.toLowerCase().includes(t) || r.email.toLowerCase().includes(t)) &&
      (filter === 'all' || (filter === 'trained' && r.trained) || (filter === 'untrained' && !r.trained) || (filter === 'requested' && r.requestedAt != null)))
      .sort((a, b) => (b.requestedAt ?? 0) - (a.requestedAt ?? 0))
  }, [rows, q, filter])
  const counts = { trained: rows.filter(r => r.trained).length, requested: rows.filter(r => r.requestedAt != null).length }

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />
  const btn = 'rounded-md border border-br-dk-border px-2.5 py-1 text-xs text-br-dk-text hover:text-br-gold disabled:opacity-40'

  return (
    <div className={`ops ${plexMono.className} min-h-screen`}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-baseline gap-3 border-b border-br-dk-border pb-3">
          <Link href="/admin" className="text-br-dk-sub text-xs">radio-ops</Link>
          <h1 className="text-br-dk-text text-base font-semibold">training</h1>
          <span className="text-xs text-br-dk-sub ml-auto">{counts.trained} certified · {counts.requested} waiting for training</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email" className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text min-w-[14rem]" />
          {(['all', 'trained', 'untrained', 'requested'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`${btn} ${filter === f ? 'text-br-gold border-br-gold' : ''}`}>{f}</button>
          ))}
        </div>
        {error && <p className="text-sm text-br-red">{error}</p>}
        <ul className="divide-y divide-br-dk-border sk-raised">
          {shown.map(r => (
            <li key={r.uid} className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-br-dk-text truncate">{r.name || r.email} <span className="text-xs text-br-dk-muted">{r.role}</span></p>
                <p className="text-xs text-br-dk-sub truncate">{r.email}</p>
                {r.requestedAt && <p className="text-xs text-br-gold">Asked for training {new Date(r.requestedAt).toLocaleDateString()}{r.requestNote ? `: "${r.requestNote}"` : ''}</p>}
              </div>
              <div className="text-xs text-br-dk-sub tabular-nums">
                {r.trained ? <span className="text-br-green">Certified{r.certifiedAt ? ` ${new Date(r.certifiedAt).toLocaleDateString()}` : ''}{r.score != null ? ` · ${r.score}%` : ''}{r.certifiedBy && r.certifiedBy !== 'quiz' ? ' · in person' : ''}</span> : <span>Not certified{r.attempts ? ` · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}` : ''}</span>}
                <span className="ml-3">{r.conductSigned ? 'conduct signed' : 'conduct not signed'}</span>
              </div>
              <div className="flex gap-2">
                {!r.trained && <button className={btn} disabled={busy === r.uid} onClick={() => act(r.uid, 'certify')}>Certify</button>}
                {r.trained && <button className={btn} disabled={busy === r.uid} onClick={() => act(r.uid, 'revoke')}>Revoke</button>}
                {r.requestedAt && <button className={btn} disabled={busy === r.uid} onClick={() => act(r.uid, 'clearRequest')}>Clear request</button>}
              </div>
            </li>
          ))}
          {!shown.length && <li className="p-4 text-sm text-br-dk-sub">No one matches.</li>}
        </ul>
      </div>
    </div>
  )
}
