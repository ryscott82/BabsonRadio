'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import { DAYPARTS, type AutoConfig, type Daypart } from '@/lib/autoschedule'

interface Stat { label: string; weight: number; samples: number; parts: Record<Daypart, number> }

/** Admins only: how often each playlist plays. Auto uses what listeners like; Manual pins a number (1 = average, 2 = twice as often, 0 = avoid). */
export default function AutoWeights({ cfg, genres, update }: { cfg: AutoConfig; genres: string[]; update: (p: Partial<AutoConfig>) => void }) {
  const [stats, setStats] = useState<Stat[]>([])
  useEffect(() => { apiGet<{ stats: Stat[] }>('/api/admin/insights').then(r => setStats(r.stats)).catch(() => {}) }, [])
  const set = (g: string, v: number | undefined) => {
    const next = { ...(cfg.weightOverrides ?? {}) }
    const k = g.toLowerCase()
    if (v === undefined) delete next[k]; else next[k] = Math.round(v * 100) / 100
    update({ weightOverrides: next })
  }
  return (
    <div className="space-y-3">
      <h3 className="text-xl font-light">How often each playlist plays</h3>
      <p className="text-base opacity-90">Auto uses listener counts, ratings and reactions{cfg.learn ? '' : ' (learning is off, so it counts as average)'}. Manual pins it: 1 is average, 2 is twice as often, 0 avoids it.</p>
      <ul className="divide-y divide-white/25">
        {genres.map(g => {
          const manual = cfg.weightOverrides?.[g.toLowerCase()]
          const stat = stats.find(x => x.label.toLowerCase() === g.toLowerCase())
          return (
            <li key={g} className="py-2 flex flex-wrap items-center gap-3 text-base">
              <span className="min-w-40 flex-1">{g}</span>
              <button type="button" className="ops-btn px-3 min-h-11" aria-pressed={manual === undefined} onClick={() => set(g, undefined)}>Auto{manual === undefined ? ` · ${(cfg.learn && stat ? stat.weight : 1).toFixed(2)}×` : ''}</button>
              <button type="button" className="ops-btn px-3 min-h-11" aria-pressed={manual !== undefined} onClick={() => set(g, manual ?? stat?.weight ?? 1)}>Manual</button>
              {manual !== undefined && <input type="number" min={0} max={3} step={0.05} className="ops-field w-24 min-h-11" value={manual} aria-label={`${g} frequency`} onChange={e => set(g, Number(e.target.value))} />}
              {manual === undefined && cfg.learn && stat && stat.samples > 0 && (
                <span className="text-base opacity-80 w-full sm:w-auto">{DAYPARTS.map(d => `${d.label} ${stat.parts[d.id].toFixed(2)}×`).join(' · ')}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
