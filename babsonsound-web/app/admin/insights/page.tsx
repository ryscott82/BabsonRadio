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
  const [tab, setTab] = useState<'dash' | 'raw'>('dash')
  useEffect(() => { if (!loading && (!user || !(isAdmin || isDirector))) router.replace('/') }, [loading, user, isAdmin, isDirector, router])
  useEffect(() => { if (user && (isAdmin || isDirector)) apiGet<{ stats: S[] }>('/api/admin/insights').then(r => setRows(r.stats)).catch(e => setErr(e.message)) }, [user, isAdmin, isDirector])
  const f = (n: number, d = 1) => (n ? n.toFixed(d) : '–')
  const list = rows ?? []
  const solid = list.filter(r => r.samples >= 5) // enough listening samples to trust
  const byListeners = [...solid].sort((a, b) => b.listeners - a.listeners)
  const maxL = Math.max(1, ...byListeners.map(r => r.listeners))
  const stars = (r: S) => (r.songRatings + r.blockRatings ? (r.songStars * r.songRatings + r.blockStars * r.blockRatings) / (r.songRatings + r.blockRatings) : 0)
  const top = byListeners[0]
  const loved = [...solid].filter(r => r.songRatings + r.blockRatings >= 3).sort((a, b) => stars(b) - stars(a))[0]
  const buzz = [...list].sort((a, b) => b.reactions - a.reactions)[0]
  const playMore = solid.filter(r => r.weight >= 1.2).sort((a, b) => b.weight - a.weight).slice(0, 4)
  const playLess = solid.filter(r => r.weight <= 0.8).sort((a, b) => a.weight - b.weight).slice(0, 4)
  const thin = list.length - solid.length
  const totalAvg = solid.length ? solid.reduce((n, r) => n + r.listeners, 0) / solid.length : 0

  return (
    <div className="px-5 lg:px-8 py-8 space-y-4">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Listener insights</h1>
      <p className="text-sm text-br-dk-sub">The last 60 days. It needs a few days of data before the numbers mean much.</p>
      <div className="flex gap-1 border-b border-br-dk-border" role="tablist">
        {([['dash', 'Dashboard'], ['raw', 'Raw data']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`font-display tracking-widest text-sm px-4 py-2 -mb-px border-b-2 ${tab === k ? 'border-br-gold text-br-gold' : 'border-transparent text-br-dk-sub hover:text-br-dk-text'}`}>{l}</button>
        ))}
      </div>
      {err && <p className="text-sm text-br-red">{err}</p>}
      {rows && !rows.length && <p className="text-sm text-br-dk-sub py-4">Nothing yet. Data appears once people listen, rate and react.</p>}

      {tab === 'dash' && rows && rows.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['AVG LISTENERS', totalAvg ? totalAvg.toFixed(1) : '–', 'across genres and shows with enough data'],
              ['MOST LISTENED', top?.label ?? '–', top ? `${top.listeners.toFixed(1)} on average` : ''],
              ['BEST RATED', loved?.label ?? '–', loved ? `${stars(loved).toFixed(1)} stars` : 'needs 3+ ratings'],
              ['MOST REACTIONS', buzz && buzz.reactions ? buzz.label : '–', buzz && buzz.reactions ? `${buzz.reactions.toFixed(0)} reactions` : ''],
            ].map(([k, v, sub]) => (
              <div key={k} className="sk-raised rounded-xl p-4">
                <p className="font-display text-[14px] tracking-widest text-br-dk-sub">{k}</p>
                <p className="text-br-dk-text text-lg mt-1 truncate">{v}</p>
                <p className="text-xs text-br-dk-muted truncate">{sub}</p>
              </div>
            ))}
          </div>

          <section className="sk-raised rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-br-gold tracking-widest text-sm">What to do</h2>
            <ul className="text-sm text-br-dk-text space-y-2 list-disc pl-5">
              {playMore.length > 0 && <li><strong>Play more of:</strong> {playMore.map(r => r.label).join(', ')}. Listeners rate and stay for these.</li>}
              {playLess.length > 0 && <li><strong>Consider less of:</strong> {playLess.map(r => r.label).join(', ')}. Below-average listening or ratings. The scheduler already plays them less but still gives them airtime.</li>}
              {top && <li><strong>Put your best shows in the {top.label} lane:</strong> it has the biggest audience, so it is the best home for announcements and new shows.</li>}
              {thin > 0 && <li>{thin} genre{thin === 1 ? ' has' : 's have'} fewer than 5 listening samples, so they are left out of the picks above. Give them more airtime before judging.</li>}
              {!playMore.length && !playLess.length && <li>No genre stands out yet. Check back after a few more days of listening.</li>}
            </ul>
          </section>

          <section className="sk-raised rounded-2xl p-5 space-y-2">
            <h2 className="font-display text-br-gold tracking-widest text-sm">Average listeners</h2>
            {byListeners.slice(0, 12).map(r => (
              <div key={r.label} className="flex items-center gap-3 text-xs">
                <span className="w-40 shrink-0 truncate text-br-dk-text">{r.label}</span>
                <div className="flex-1 h-3 rounded bg-br-dk-surface2 overflow-hidden"><div className="h-full bg-br-green" style={{ width: `${(r.listeners / maxL) * 100}%` }} /></div>
                <span className="w-10 text-right tabular-nums text-br-dk-sub">{r.listeners.toFixed(1)}</span>
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === 'raw' && (
        <div className="overflow-x-auto">
          <p className="text-xs text-br-dk-sub pb-2">Weight 1.0 is average; the auto-scheduler plays higher-weight genres more often. Numbers in brackets are how many samples or ratings back each figure.</p>
          <table className="w-full text-sm text-br-dk-text">
            <thead className="text-xs text-br-dk-sub text-left"><tr>
              <th className="py-2 pr-4">Genre or show</th><th className="pr-4">Avg listeners</th><th className="pr-4">Song stars</th><th className="pr-4">Block stars</th><th className="pr-4">Reactions</th><th>Weight</th>
            </tr></thead>
            <tbody>
              {list.map(r => (
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
        </div>
      )}
    </div>
  )
}
