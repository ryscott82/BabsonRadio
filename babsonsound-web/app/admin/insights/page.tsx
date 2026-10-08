'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'

interface S { label: string; listeners: number; samples: number; songStars: number; songRatings: number; blockStars: number; blockRatings: number; reactions: number; weight: number }

export default function InsightsPage() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<S[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { if (!loading && (!user || !(isAdmin || isDirector))) router.replace('/') }, [loading, user, isAdmin, isDirector, router])
  useEffect(() => { if (user && (isAdmin || isDirector)) apiGet<{ stats: S[] }>('/api/admin/insights').then(r => setRows(r.stats)).catch(e => setErr(e.message)) }, [user, isAdmin, isDirector])
  const f = (n: number, d = 1) => (n ? n.toFixed(d) : '–')
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">LISTENER INSIGHTS</h1>
      <p className="text-sm text-br-dk-sub">The last 60 days. Weight 1.0 is average; the auto-scheduler plays higher-weight genres more often. It needs a few days of data before the numbers mean much.</p>
      {err && <p className="text-sm text-br-red">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-br-dk-text">
          <thead className="text-xs text-br-dk-sub text-left"><tr>
            <th className="py-2 pr-4">Genre or show</th><th className="pr-4">Avg listeners</th><th className="pr-4">Song stars</th><th className="pr-4">Block stars</th><th className="pr-4">Reactions</th><th>Weight</th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map(r => (
              <tr key={r.label} className="border-t border-br-dk-border">
                <td className="py-2 pr-4">{r.label}</td>
                <td className="pr-4 tabular-nums">{f(r.listeners)} <span className="text-br-dk-muted text-xs">({r.samples})</span></td>
                <td className="pr-4 tabular-nums">{f(r.songStars)} <span className="text-br-dk-muted text-xs">({r.songRatings})</span></td>
                <td className="pr-4 tabular-nums">{f(r.blockStars)} <span className="text-br-dk-muted text-xs">({r.blockRatings})</span></td>
                <td className="pr-4 tabular-nums">{f(r.reactions)}</td>
                <td className="tabular-nums text-br-gold">{r.weight.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length && <p className="text-sm text-br-dk-sub py-4">Nothing yet. Data appears once people listen, rate and react.</p>}
      </div>
    </div>
  )
}
