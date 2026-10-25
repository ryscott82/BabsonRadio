'use client'

import FilterBar, { Pick, MoreButton, useFilter, usePaged } from '@/components/admin/FilterBar'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'

interface Row { uid: string; name: string; platform: string; label: string; start: number; end: number; minutes: number }
interface Data { days: number; truncated: boolean; uniqueListeners: number; sessions: number; totalHours: number; hoursUtc: number[]; list: Row[] }

const when = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function ListeningLog() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [days, setDays] = useState(7)
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) apiGet<Data>(`/api/admin/listening?days=${days}`).then(setD).catch(e => setErr(e.message)) }, [user, isAdmin, days])

  function csv() {
    if (!d) return
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = ['name,platform,show or block,start,end,minutes', ...d.list.map(r => [q(r.name), r.platform, q(r.label), new Date(r.start).toISOString(), new Date(r.end).toISOString(), r.minutes].join(','))]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    a.download = `listening-log-${days}d.csv`; a.click()
  }

  const [plat, setPlat] = useState('')
  const f = useFilter(d?.list ?? [], (r: Row) => `${r.name} ${r.label} ${r.platform === 'ios' ? 'ios app' : 'website'}`)
  const rowsF = f.items.filter(r => !plat || r.platform === plat)
  const paged = usePaged(rowsF)

  // Shift the UTC hours to the viewer's local hours for the chart.
  const offset = -new Date().getTimezoneOffset() / 60
  const local = d ? Array.from({ length: 24 }, (_, h) => d.hoursUtc[(h - offset + 48) % 24]) : []
  const max = Math.max(1, ...local)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Listening log</h1>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text">
          {[1, 7, 14, 30].map(n => <option key={n} value={n}>Last {n} day{n > 1 ? 's' : ''}</option>)}
        </select>
        <button type="button" onClick={csv} className="sk-key rounded-lg px-4 py-2 text-xs font-display tracking-widest text-br-dk-text ml-auto">Download csv</button>
      </div>
      {err && <p className="text-sm text-br-red">{err}</p>}
      {d && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[['Listeners', d.uniqueListeners], ['Sessions', d.sessions], ['Hours listened', d.totalHours]].map(([k, v]) => (
              <div key={k} className="sk-raised rounded-xl p-4"><p className="font-display text-3xl text-br-dk-text tabular-nums">{v}</p><p className="text-xs text-br-dk-sub">{k}</p></div>
            ))}
          </div>
          <div className="sk-raised rounded-xl p-4">
            <p className="text-xs text-br-dk-sub mb-2">Listening by hour of day (your time)</p>
            <div className="flex items-end gap-1 h-24" role="img" aria-label="Listening minutes by hour of day">
              {local.map((v, h) => <div key={h} title={`${h}:00 · ${v} min`} className="flex-1 bg-br-gold/70 rounded-t" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />)}
            </div>
            <div className="flex justify-between text-[13px] text-br-dk-muted mt-1"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
          </div>
          <FilterBar f={f} total={d.list.length} shown={rowsF.length} placeholder="Search person or show">
            <Pick value={plat} onChange={setPlat} label="Device" options={[['', 'All devices'], ['ios', 'iOS app'], ['web', 'Website']]} />
          </FilterBar>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-br-dk-text">
              <thead className="text-xs text-br-dk-sub text-left"><tr><th className="py-2 pr-4">Person</th><th className="pr-4">Started</th><th className="pr-4">Minutes</th><th className="pr-4">On</th><th>Device</th></tr></thead>
              <tbody>
                {paged.items.map((r, i) => (
                  <tr key={i} className="border-t border-br-dk-border">
                    <td className="py-1.5 pr-4">{r.name}</td><td className="pr-4">{when(r.start)}</td>
                    <td className="pr-4 tabular-nums">{r.minutes}</td><td className="pr-4 text-br-dk-sub">{r.label || '–'}</td><td className="text-br-dk-sub">{r.platform === 'ios' ? 'iOS app' : 'Website'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.truncated && <p className="text-xs text-br-dk-sub py-2">Showing the most recent sessions only. Pick a shorter range for the full list.</p>}
          </div>
          <MoreButton p={paged} />
        </>
      )}
    </div>
  )
}
