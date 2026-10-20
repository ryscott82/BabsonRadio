'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'

interface State {
  locked: boolean; reason: string; usedHours: number; reactionsHours: number; projectedHours: number; month: string
  config: { budgetHours: number; reactionShare: number; baseHours: number; reactionsLocked: boolean; auto: boolean }
}

// Server time on Vercel (free plan: about 4 hours a month; the whole site pauses at the limit). Reactions lock first.
export default function CpuMeter() {
  const [s, setS] = useState<State | null>(null)
  const [cfg, setCfg] = useState<State['config'] | null>(null)
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    try { const r = await apiGet<State>('/api/admin/cpu'); setS(r); setCfg(r.config) } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not load.') }
  }, [])
  useEffect(() => { queueMicrotask(load) }, [load])
  async function save(patch: Partial<State['config']>) {
    setMsg('')
    try { await api('/api/admin/cpu', { ...cfg, ...patch }); setMsg('Saved.'); await load() } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.') }
  }
  if (!s || !cfg) return null
  const pct = Math.min(100, (s.usedHours / cfg.budgetHours) * 100)
  const field = 'sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-24'
  return (
    <div className="sk-raised p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-br-dk-text">Server time (Vercel)</p>
        <p className={`text-sm ${s.locked ? 'text-br-red' : 'text-br-gold'}`}>{s.locked ? 'Reactions paused' : 'Reactions on'}</p>
      </div>
      <p className="text-2xl text-br-dk-text tabular-nums">{s.usedHours.toFixed(2)} <span className="text-sm text-br-dk-sub">of {cfg.budgetHours} hours · {s.month}</span></p>
      <div className="h-2 rounded-full bg-br-dk-border overflow-hidden"><div className="h-full bg-br-gold" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-br-dk-sub">Reactions used {s.reactionsHours.toFixed(2)} h. On pace for {s.projectedHours.toFixed(1)} h this month.{s.reason ? ` ${s.reason}` : ''}</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => save({ reactionsLocked: !cfg.reactionsLocked })} className="rounded-md border border-br-dk-border px-3 py-1.5 text-xs text-br-dk-text hover:text-br-gold">
          {cfg.reactionsLocked ? 'Unlock reactions' : 'Lock reactions now'}</button>
        <label className="flex items-center gap-2 text-xs text-br-dk-sub"><input type="checkbox" checked={cfg.auto} onChange={e => save({ auto: e.target.checked })} /> Lock automatically when close to the limit</label>
      </div>
      <details className="text-xs text-br-dk-sub">
        <summary className="cursor-pointer">Settings</summary>
        <div className="space-y-2 pt-2">
          <label className="flex items-center justify-between gap-3">Monthly allowance (hours)
            <input type="number" step="0.5" className={field} value={cfg.budgetHours} onChange={e => setCfg({ ...cfg, budgetHours: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-3">Share reactions may use (0–1)
            <input type="number" step="0.05" className={field} value={cfg.reactionShare} onChange={e => setCfg({ ...cfg, reactionShare: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-3">Already counted by Vercel but not here (hours)
            <input type="number" step="0.1" className={field} value={cfg.baseHours} onChange={e => setCfg({ ...cfg, baseHours: Number(e.target.value) })} /></label>
          <button onClick={() => save({})} className="rounded-md border border-br-dk-border px-3 py-1.5 text-xs text-br-dk-text hover:text-br-gold">Save</button>
        </div>
      </details>
      {msg && <p className="text-xs text-br-gold">{msg}</p>}
    </div>
  )
}
