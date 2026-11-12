'use client'

import { useState } from 'react'
import { overallCost } from '@/lib/serverUsage'
import { featureRows, whatIf } from '@/lib/usageView'
import type { Overview } from '@/lib/server/serverUsage'
import { fmtH, fmtInt } from './format'

const TIER = (t: number) => (t === 0 ? 'Never limited' : `Tier ${t}`)

// What each feature costs, and a what-if box. The calls per hour come from the backend report; the time per call is our meter's (this server only).
export default function FeatureImpact({ d }: { d: Overview }) {
  const rows = featureRows(d.routes.totals)
  const measured = overallCost(d.costs.slice(-4)) // the last four stretches: steadier than one
  const guess = rows.filter(r => r.kind === 'per-listener' && r.secondsPerHour !== null).reduce((a, r) => a + (r.secondsPerHour ?? 0), 0)
  const [listeners, setListeners] = useState('20')
  const [hours, setHours] = useState('100')
  const [secs, setSecs] = useState('')
  const basis = secs.trim() !== '' ? Number(secs) : measured
  const w = basis === null ? null : whatIf({ listeners: Number(listeners), hours: Number(hours), secondsPerListenerHour: basis, allowanceHours: d.allowanceHours, usedHours: d.status.hours })
  const field = 'ops-field w-full'
  return (
    <section className="space-y-2" aria-label="What each feature costs">
      <h2 className="text-2xl font-light">What each feature costs</h2>
      <div className="ops-card overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead className="border-b border-white/25"><tr><th className="text-left font-normal px-3 py-2">Feature</th><th className="text-left font-normal px-3 py-2">Limit tier</th><th className="text-right font-normal px-3 py-2">Calls an hour</th><th className="text-right font-normal px-3 py-2">Server time per call</th><th className="text-right font-normal px-3 py-2">Seconds an hour</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-white/25 last:border-0 align-top">
                <td className="px-3 py-2"><span className="block text-lg">{r.name}</span><span className="block text-base opacity-90">{r.note}</span></td>
                <td className="px-3 py-2">{TIER(r.tier)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.callsPerHour)}<span className="block text-base opacity-90">{r.kind === 'per-listener' ? 'per listener' : 'whole site, at most'}</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.avgMs === null ? 'not seen' : `${Math.round(r.avgMs * 10) / 10} ms`}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.secondsPerHour === null ? '' : fmtH(r.secondsPerHour)}<span className="block text-base opacity-90">{r.secondsPerHour === null ? '' : r.kind === 'per-listener' ? 'per listener' : 'whole site'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-base opacity-90">Calls an hour are from the backend report and are estimates. Server time per call is from this one server over the last hour, so it is blank until that route has run here. Calls that Vercel answers from its cache never reach a server. Shared work does not grow with the number of listeners; per-listener work does, so the first rows move the limit as the audience grows and the shared rows set the floor.</p>

      <div className="ops-card p-3 space-y-3">
        <h3 className="text-xl">What if</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">Listeners at once<input className={field} inputMode="numeric" value={listeners} onChange={e => setListeners(e.target.value)} /></label>
          <label className="block">Hours on air<input className={field} inputMode="numeric" value={hours} onChange={e => setHours(e.target.value)} /></label>
          <label className="block">Server seconds per listener-hour<input className={field} inputMode="decimal" placeholder={measured === null ? 'needs a number' : String(Math.round(measured))} value={secs} onChange={e => setSecs(e.target.value)} /></label>
        </div>
        <p className="text-base opacity-90">{secs.trim() !== '' ? 'Using the number you typed.' : measured !== null ? `Using ${Math.round(measured)} seconds, measured from your last readings (it includes the shared work).` : `No measurement yet. Per-listener calls alone come to about ${fmtH(guess)} seconds from our meter; type a number to try it.`}</p>
        <div aria-live="polite" className="min-h-[3.5rem]">
          {w ? (
            <p className="text-lg">About {fmtH(w.cpuHours)} hours of server time, {Math.round(w.pctOfAllowance)}% of the {fmtH(d.allowanceHours)} hour allowance.
              {w.afterThisHours !== null && <span className="block text-base opacity-95">With {fmtH(d.status.hours)} h already used this month, that would bring it to about {fmtH(w.afterThisHours)} h{w.fits ? ', inside the allowance.' : ', over the allowance.'}</span>}
            </p>
          ) : <p>Enter listeners and hours as numbers (0 or more){basis === null ? ', and a number of seconds' : ''}.</p>}
        </div>
      </div>
    </section>
  )
}
