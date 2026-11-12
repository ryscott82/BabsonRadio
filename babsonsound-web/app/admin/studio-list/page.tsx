'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { copyText, KIND_WORD, type ListItem } from '@/lib/strikesAdmin'
import { guestCsv } from '@/lib/studioList'

const when = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })

// Studio list: upcoming studio bookings and shows with who is coming (names and emails), copy and CSV. E-board and Admin. Loads when opened.
export default function StudioListPage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<ListItem[] | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  useEffect(() => { if (user && isDirector) apiGet<{ rows: ListItem[] }>('/api/admin/studio/list').then(r => setRows(r.rows)).catch(e => { setErr(e instanceof Error ? e.message : 'Could not load the list.'); setRows([]) }) }, [user, isDirector])

  async function copy() {
    try { await navigator.clipboard.writeText(copyText(rows ?? [])); setMsg('Copied.') } catch { setMsg('Could not copy. Use the CSV instead.') }
  }
  function csv() {
    const url = URL.createObjectURL(new Blob([guestCsv(rows ?? [])], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'guest-list.csv'; a.click(); URL.revokeObjectURL(url)
  }

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />
  const groups = new Map<string, ListItem[]>()
  for (const r of rows ?? []) { const k = day(r.startAt); groups.set(k, [...(groups.get(k) ?? []), r]) }

  return (
    <div className="px-5 lg:px-8 py-6 space-y-6 max-w-4xl">
      <h1 className="text-4xl font-light leading-tight">Studio list</h1>
      <p className="text-base">Upcoming studio bookings and shows, with who is coming. Guest details are deleted 90 days after the date.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={copy} disabled={!rows?.length} className="ops-btn px-5 min-h-11 disabled:opacity-50">Copy</button>
        <button type="button" onClick={csv} disabled={!rows?.length} className="ops-btn px-5 min-h-11 disabled:opacity-50">Download CSV</button>
        {msg && <span role="status" className="text-base self-center">{msg}</span>}
      </div>
      {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{err}</p>}
      {!rows && <p className="text-base">Loading…</p>}
      {rows && rows.length === 0 && !err && <p className="text-base">Nothing is booked yet.</p>}
      {[...groups.entries()].map(([d, list]) => (
        <section key={d} className="ops-card p-5 space-y-3" aria-label={d}>
          <h2 className="text-2xl font-light">{d}</h2>
          <ul className="divide-y divide-white/25">
            {list.map((r, i) => (
              <li key={`${r.startAt}-${i}`} className="py-3 space-y-1">
                <p className="text-lg leading-snug">{r.title} <span className="text-base opacity-90">· {KIND_WORD[r.kind]}{r.status === 'pending' ? ' (pending)' : ''}</span></p>
                <p className="text-base opacity-90">{when(r.startAt)} · {r.hostName}{r.hostEmail ? ` · ${r.hostEmail}` : ''}</p>
                {r.guests.length > 0
                  ? <ul className="list-disc pl-6 text-base">{r.guests.map((g, k) => <li key={k}>{g.name} · {g.email}</li>)}</ul>
                  : <p className="text-base">{r.justMe ? 'Just the host' : 'No guest list'}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
