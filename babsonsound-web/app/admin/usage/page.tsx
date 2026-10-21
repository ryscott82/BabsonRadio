'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { plexMono } from '@/components/admin/opsFont'
import CpuMeter from '@/components/admin/CpuMeter'

interface Data {
  forecast: { mode: string; sigma: number; historyDays: number; level: number; lifts: { label: string; lift: number; hours: number; avg: number }[] } | null
  budget: { riskHours: number; guestsOpen: boolean; forecastMode: string; usedHours: number; limitHours: number; projectedHours: number; pct: number; level: string; month: string; byDay: Record<string, number>; peak: number }
  policy: { idleMin: number; sessionMaxMin: number; dailyCapMin: number | null; liveOnly: boolean }
  config: { limitHours: number; quietEnabled: boolean; quietStart: number; quietEnd: number; guestAutoMin: number }
  activeSessions: number
}
const LEVELS: Record<string, string> = { normal: 'Normal', tight: 'Tightened', critical: 'Strict', liveOnly: 'Live shows only' }

// How many of the plan's listener-hours are used this month, and what the player is doing about it.
export default function UsagePage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [d, setD] = useState<Data | null>(null)
  const [cfg, setCfg] = useState<Data['config'] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  const load = useCallback(async () => {
    try { const r = await apiGet<Data>('/api/admin/usage'); setD(r); setCfg(r.config) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.') }
  }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  async function save() {
    setError(''); setNotice('')
    try { await api('/api/admin/usage', { ...cfg }); setNotice('Saved.'); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }

  if (loading || !user || !isAdmin || !d || !cfg) return <div className="min-h-[60vh]" />
  const b = d.budget
  const days = Object.entries(b.byDay).map(([k, v]) => [Number(k), v] as const).sort((a, c) => a[0] - c[0])
  const max = Math.max(1, ...days.map(x => x[1]))
  const field = 'sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-24'

  return (
    <div className={`ops ${plexMono.className} min-h-screen`}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-baseline gap-3 border-b border-br-dk-border pb-3">
          <Link href="/admin" className="text-br-dk-sub text-xs">radio-ops</Link>
          <h1 className="text-br-dk-text text-base font-semibold">listening hours</h1>
          <span className="text-xs text-br-dk-sub ml-auto">{b.month}</span>
        </div>
        {error && <p className="text-sm text-br-red">{error}</p>}

        <div className="sk-raised p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl text-br-dk-text tabular-nums">{b.usedHours} <span className="text-sm text-br-dk-sub">of {b.limitHours} hours</span></p>
            <p className="text-sm text-br-gold">{LEVELS[b.level] ?? b.level}</p>
          </div>
          <div className="h-2 rounded-full bg-br-dk-border overflow-hidden"><div className="h-full bg-br-gold" style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
          <p className="text-xs text-br-dk-sub">
            Expected {b.projectedHours} hours by month end{b.projectedHours > b.limitHours ? ', over the limit' : ''}; probably no more than {b.riskHours}. {d.activeSessions} listening now with the app or site. Peak {b.peak} at once.
          </p>
          <p className="text-xs text-br-dk-sub">
            Guests: {b.guestsOpen ? 'can listen to everything (comfortably under the limit).' : 'live shows plus a few playlist minutes a day (the month is close to the limit).'}
          </p>
          <p className="text-xs text-br-dk-sub">
            Now: ask &quot;still listening?&quot; after {d.policy.idleMin} min, stop after {d.policy.sessionMaxMin / 60} h
            {d.policy.dailyCapMin != null ? `, ${d.policy.dailyCapMin} min a day each (on pace to run over)` : ', no daily cap (on pace to stay under)'}
            {d.policy.liveOnly ? ', playlists paused' : ''}.
          </p>
        </div>

        {d.forecast && (
          <div className="sk-raised p-4 space-y-2">
            <p className="text-sm text-br-dk-text">Forecast</p>
            <p className="text-xs text-br-dk-sub">
              {d.forecast.mode === 'history'
                ? `Learned from ${d.forecast.historyDays} days of listening by weekday, hour and show or genre. Typical daily error about ${Math.round(d.forecast.sigma * 100)}%. Recent days run at ${Math.round(d.forecast.level * 100)}% of the usual pattern.`
                : `Only ${d.forecast.historyDays} days of history so far, so this is a simple pace estimate with a wide margin. It switches to the full model after about a week.`}
            </p>
            {d.forecast.lifts.length > 0 && (
              <table className="w-full text-xs text-br-dk-sub">
                <thead><tr className="text-left"><th className="font-normal">Show or genre</th><th className="font-normal text-right">Avg listeners</th><th className="font-normal text-right">vs. usual slot</th></tr></thead>
                <tbody>{d.forecast.lifts.map(l => (
                  <tr key={l.label}><td className="text-br-dk-text">{l.label || 'unscheduled'}</td><td className="text-right tabular-nums">{l.avg.toFixed(1)}</td>
                    <td className="text-right tabular-nums">{l.lift >= 1 ? '+' : ''}{Math.round((l.lift - 1) * 100)}%</td></tr>))}</tbody>
              </table>
            )}
          </div>
        )}

        {days.length > 0 && (
          <div className="sk-raised p-4">
            <p className="text-xs text-br-dk-sub mb-2">Hours per day</p>
            <div className="flex items-end gap-1 h-24">
              {days.map(([day, v]) => (
                <div key={day} className="flex-1 flex flex-col items-center justify-end h-full" title={`Day ${day}: ${v} h`}>
                  <div className="w-full bg-br-gold/70 rounded-sm" style={{ height: `${(v / max) * 100}%` }} />
                  <span className="text-[12px] text-br-dk-sub mt-1">{day}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <CpuMeter />

        <div className="sk-raised p-4 space-y-3">
          <p className="text-sm text-br-dk-text">Settings</p>
          <label className="flex items-center justify-between gap-3 text-sm text-br-dk-sub">Monthly limit (hours)
            <input type="number" className={field} value={cfg.limitHours} onChange={e => setCfg({ ...cfg, limitHours: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-3 text-sm text-br-dk-sub">Guest minutes of playlist per day
            <input type="number" className={field} value={cfg.guestAutoMin} onChange={e => setCfg({ ...cfg, guestAutoMin: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-3 text-sm text-br-dk-sub">Overnight quiet hours
            <input type="checkbox" checked={cfg.quietEnabled} onChange={e => setCfg({ ...cfg, quietEnabled: e.target.checked })} /></label>
          <div className="flex items-center justify-between gap-3 text-sm text-br-dk-sub">From / until (hour, 0–23)
            <span className="flex gap-2">
              <input type="number" className={field} value={cfg.quietStart} onChange={e => setCfg({ ...cfg, quietStart: Number(e.target.value) })} />
              <input type="number" className={field} value={cfg.quietEnd} onChange={e => setCfg({ ...cfg, quietEnd: Number(e.target.value) })} />
            </span></div>
          <button onClick={save} className="rounded-md border border-br-dk-border px-3 py-1.5 text-xs text-br-dk-text hover:text-br-gold">Save</button>
          {notice && <span className="ml-3 text-xs text-br-gold">{notice}</span>}
        </div>
      </div>
    </div>
  )
}
