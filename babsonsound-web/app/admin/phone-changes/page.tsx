'use client'

import FilterBar, { MoreButton, useFilter, usePaged } from '@/components/admin/FilterBar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { formatPhone } from '@/components/AuthUI'
import { plexMono } from '@/components/admin/opsFont'

interface Req { uid: string; name: string; email: string; oldPhone: string; newPhone: string; at: number }
const show = (p: string) => (p.startsWith('+1') ? formatPhone(p.slice(2)) : p) || 'none'

const textOf = (r: Req) => `${r.name} ${r.email} ${r.oldPhone} ${r.newPhone}`

// People ask to change their phone number from their profile; an admin confirms it here.
export default function PhoneChangesPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<Req[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [uid, setUid] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  const load = useCallback(async () => {
    try { setRows((await apiGet<{ requests: Req[] }>('/api/admin/phone-changes')).requests) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.') }
  }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  async function act(body: Record<string, string>) {
    setBusy(body.uid); setError('')
    try { await api('/api/admin/phone-changes', body); await load(); if (body.action === 'set') { setUid(''); setPhone('') } } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setBusy('')
  }

  const f = useFilter(rows, textOf)
  const paged = usePaged(f.items)
  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  const btn = 'rounded-md border border-br-dk-border px-2.5 py-1 text-xs text-br-dk-text hover:text-br-gold disabled:opacity-40'

  return (
    <div className={`ops ${plexMono.className} min-h-screen`}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-baseline gap-3 border-b border-br-dk-border pb-3">
          <Link href="/admin" className="text-br-dk-sub text-xs">radio-ops</Link>
          <h1 className="text-br-dk-text text-base font-semibold">phone changes</h1>
          <span className="text-xs text-br-dk-sub ml-auto">{rows.length} waiting</span>
        </div>
        <FilterBar f={f} total={rows.length} placeholder="Search name, email or number" />
        {error && <p className="text-sm text-br-red">{error}</p>}
        <ul className="divide-y divide-br-dk-border sk-raised">
          {paged.items.map(r => (
            <li key={r.uid} className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-br-dk-text truncate">{r.name} <span className="text-xs text-br-dk-sub">{r.email}</span></p>
                <p className="text-xs text-br-dk-sub">{show(r.oldPhone)} → <span className="text-br-gold">{show(r.newPhone)}</span> · asked {new Date(r.at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <button className={`${btn} text-br-gold border-br-gold`} disabled={busy === r.uid} onClick={() => act({ uid: r.uid, action: 'approve' })}>Approve</button>
                <button className={btn} disabled={busy === r.uid} onClick={() => act({ uid: r.uid, action: 'reject' })}>Reject</button>
              </div>
            </li>
          ))}
          {!rows.length && <li className="p-4 text-sm text-br-dk-sub">No requests.</li>}
        </ul>
        <MoreButton p={paged} />
        <div className="sk-raised p-3 space-y-2">
          <p className="text-sm text-br-dk-text">Set a number directly</p>
          <p className="text-xs text-br-dk-sub">Needs the account&apos;s ID (from Users and roles).</p>
          <div className="flex flex-wrap gap-2">
            <input value={uid} onChange={e => setUid(e.target.value.trim())} placeholder="Account ID" className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text min-w-[14rem] flex-1" />
            <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(617) 555-1234" inputMode="tel" className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text" />
            <button className={btn} disabled={!uid || !phone || busy === uid} onClick={() => act({ uid, action: 'set', phone })}>Set number</button>
          </div>
        </div>
      </div>
    </div>
  )
}
