'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'

const iso = (d: Date) => d.toISOString().slice(0, 10)

// Download everything that aired, for royalty reporting (SoundExchange) and for the music director.
export default function PlayLogPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 7 * 86_400_000)))
  const [to, setTo] = useState(() => iso(new Date()))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])

  async function download() {
    setBusy(true); setError(''); setMsg('')
    try {
      const r = await apiGet<{ count: number; filename: string; csv: string }>(`/api/admin/playlog?from=${from}&to=${to}`)
      const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' }))
      const a = document.createElement('a'); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url)
      setMsg(`${r.count} plays saved to ${r.filename}.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not build the log.') }
    setBusy(false)
  }

  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  return (
    <div className="min-h-screen">
      <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-6 space-y-4">
        <div className="flex items-baseline gap-3 border-b border-br-dk-border pb-3">
          <Link href="/admin" className="text-br-dk-sub text-xs">Settings</Link>
          <h1 className="text-br-dk-text text-base font-semibold">play log</h1>
        </div>
        <p className="text-sm text-br-dk-sub">Every track that aired, in Eastern time: artist, title, album, ISRC when AzuraCast has it, length, playlist and live DJ. Keep these files; reporting to SoundExchange and the license holder is built from them.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-br-dk-sub">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="sk-field block rounded-lg px-3 py-2 text-sm text-br-dk-text mt-1" /></label>
          <label className="text-xs text-br-dk-sub">To<input type="date" value={to} onChange={e => setTo(e.target.value)} className="sk-field block rounded-lg px-3 py-2 text-sm text-br-dk-text mt-1" /></label>
          <button onClick={download} disabled={busy} className="rounded-lg bg-br-gold text-black text-sm font-semibold px-4 py-2 disabled:opacity-50">{busy ? 'Building…' : 'Download CSV'}</button>
        </div>
        {msg && <p className="text-sm text-br-green">{msg}</p>}
        {error && <p className="text-sm text-br-red">{error}</p>}
      </div>
    </div>
  )
}
