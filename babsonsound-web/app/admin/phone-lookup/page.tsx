'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, formatPhone } from '@/components/AuthUI'

interface Entry { id: string; by: string; last4: string; found: boolean; result: string; at: number }
interface Paused { uid: string; name: string; email: string; reason: string; at: number }
interface Found { found: boolean; last4: string; account: { uid: string; name: string; email: string; level: string } | null }

const when = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// Admins only. Look up which account has a phone number, and clear contact syncs that were paused as a possible scrape.
export default function AdminPhoneLookupPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<Found | null>(null)
  const [log, setLog] = useState<Entry[]>([])
  const [paused, setPaused] = useState<Paused[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  const load = useCallback(async () => {
    try { const d = await apiGet<{ log: Entry[]; paused: Paused[] }>('/api/admin/phone-lookup'); setLog(d.log); setPaused(d.paused) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load.') }
  }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    setBusy('lookup'); setError(''); setResult(null)
    try { setResult(await api<Found>('/api/admin/phone-lookup', { action: 'lookup', phone })); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not look that up.') }
    setBusy('')
  }
  async function clear(uid: string) {
    setBusy(uid); setError('')
    try { await api('/api/admin/phone-lookup', { action: 'clear', uid }); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not clear that.') }
    setBusy('')
  }

  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  return (
    <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Phone lookup</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">Find the account that has a phone number. Every lookup is logged below with the last 4 digits only.</p>
      <ErrorText>{error}</ErrorText>

      <form onSubmit={lookup} className="sk-raised rounded-xl p-4 flex flex-wrap items-center gap-3">
        <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(617) 555-1234" inputMode="tel" aria-label="Phone number"
          className="ops-field min-w-[14rem]" />
        <button type="submit" className="ops-btn px-4 py-2" disabled={busy === 'lookup' || phone.replace(/\D/g, '').length < 10}>Look up</button>
      </form>

      {result && (
        <div className="sk-raised rounded-xl p-4 text-sm" role="status">
          {result.account ? (
            <>
              <p className="text-br-dk-text">{result.account.name || 'No name'} <span className="text-br-dk-sub">{result.account.email}</span></p>
              <p className="text-br-dk-sub">Ends in {result.last4} · {result.account.level || 'no level'} ·{' '}
                <Link href={`/admin/users?q=${encodeURIComponent(result.account.email)}`}>Open in Users and roles</Link></p>
            </>
          ) : <p className="text-br-dk-text">No account has a number ending in {result.last4}.</p>}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-br-dk-text text-lg">Paused accounts</h2>
        <p className="text-sm text-br-dk-sub">Contact syncing stops on its own when it looks like someone is checking lots of numbers. It stays off until you clear it.</p>
        <ul className="sk-raised rounded-xl divide-y divide-br-dk-border">
          {paused.map(p => (
            <li key={p.uid} className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-br-dk-text truncate">{p.name || 'No name'} <span className="text-br-dk-sub">{p.email}</span></p>
                <p className="text-xs text-br-dk-sub">{p.reason} · {p.at ? when(p.at) : ''}</p>
              </div>
              <Link href={`/admin/users?q=${encodeURIComponent(p.email)}`} className="text-xs">Open</Link>
              <button className="ops-btn px-3 py-1" disabled={busy === p.uid} onClick={() => clear(p.uid)}>Clear</button>
            </li>
          ))}
          {!paused.length && <li className="p-3 text-sm text-br-dk-sub">None paused.</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-br-dk-text text-lg">Lookup log</h2>
        <ul className="sk-raised rounded-xl divide-y divide-br-dk-border">
          {log.map(l => (
            <li key={l.id} className="px-4 py-2.5 text-sm flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-br-dk-text">{l.by || 'Admin'}</span>
              <span className="text-br-dk-sub">ends in {l.last4}</span>
              <span className="text-br-dk-sub">{l.found ? l.result || 'found' : 'no account'}</span>
              <span className="text-br-dk-sub ml-auto tabular-nums">{when(l.at)}</span>
            </li>
          ))}
          {!log.length && <li className="p-3 text-sm text-br-dk-sub">No lookups yet.</li>}
        </ul>
      </section>
    </div>
  )
}
