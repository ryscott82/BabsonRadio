'use client'

import { useState } from 'react'
import { api } from '@/lib/auth'
import { FEATURE_LABEL, TIER_OF, TIERS, type Feature, type Level, type Tier } from '@/lib/cpuTiers'
import { LEVEL_WORD } from '@/lib/usageBanner'
import type { Overview } from '@/lib/server/serverUsage'
import { fmtDay, fmtH } from './format'

const TIER_NAME: Record<Tier, string> = { 1: 'Tier 1: sign-in and profile', 2: 'Tier 2: presence, check-in, skip, vote, set list, ratings', 3: 'Tier 3: reactions and the emoji palette' }
const CHOICES: { value: Level | 'auto'; label: string }[] = [{ value: 'auto', label: 'Automatic' }, { value: 'normal', label: 'Normal' }, { value: 'tight', label: 'Slowed' }, { value: 'critical', label: 'Off' }]
const featuresOf = (t: Tier) => (Object.keys(TIER_OF) as Feature[]).filter(f => TIER_OF[f] === t).map(f => FEATURE_LABEL[f])

// How full the month is, what is slowed or off right now, and a manual lock per tier (it sets the same lock as POST /api/admin/cpu).
export default function TierPanel({ d, onChanged }: { d: Overview; onChanged: (msg: string) => void }) {
  const s = d.status
  const [busy, setBusy] = useState('')
  const [fail, setFail] = useState('')
  const [confirm, setConfirm] = useState<{ tier: Tier; value: Level | 'auto' } | null>(null)
  const pct = Math.min(100, s.pct)
  const fe = d.forecast.fromEntry, fm = d.forecast.fromMeter

  async function set(tier: Tier, value: Level | 'auto') {
    setBusy(`${tier}`); setFail(''); setConfirm(null)
    try { await api('/api/admin/cpu', { tierLocks: { [tier]: value === 'auto' ? null : value } }); onChanged(`Tier ${tier} is now ${value === 'auto' ? 'automatic' : LEVEL_WORD[value].toLowerCase()}.`) }
    catch (x) { setFail(x instanceof Error ? x.message : 'Could not change it.') }
    setBusy('')
  }
  const pick = (tier: Tier, value: Level | 'auto') => (tier === 1 && value === 'critical' ? setConfirm({ tier, value }) : set(tier, value))

  return (
    <section className="space-y-2" aria-label="Status">
      <h2 className="text-2xl font-light">Status</h2>
      <div className="ops-card p-3 space-y-3">
        <p className="text-3xl tabular-nums">{fmtH(s.hours)} <span className="text-lg opacity-90">of {fmtH(s.allowanceHours)} hours used ({Math.round(s.pct)}%)</span></p>
        <div className="h-3 bg-black/35 rounded-full overflow-hidden" role="progressbar" aria-label="Share of the monthly allowance used" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <ul className="space-y-1">
          <li>{s.source === 'entry' ? `The larger number is the reading from ${fmtDay(s.entryDate ?? '')}.` : 'The larger number is our own meter, which is an estimate.'}</li>
          {fe && <li>Latest reading {fmtH(fe.hours)} h ({fmtDay(fe.date)}). Our meter says {fmtH(d.meter.usedHours)} h now, so the two are {fmtH(Math.abs(d.meter.usedHours - fe.hours))} h apart{d.meter.usedHours < fe.hours ? ' (our meter is lower)' : ''}.</li>}
          {!fe && <li>No reading entered this month. Add one below to see how far our meter is from Vercel&apos;s number.</li>}
          <li>On track to end the month at about {fmtH(s.projectedMonthEnd)} h{s.projectedOver ? ', which is over the allowance' : ''}. Our meter alone says {fmtH(fm.projectedMonthEnd)} h.</li>
        </ul>
      </div>

      <div className="ops-card p-3 space-y-3">
        <p className="text-lg">Features right now: <span className="text-xl">{LEVEL_WORD[s.overall]}</span></p>
        <p className="opacity-90">Slowed means a person gets a fresh answer less often. Off means they get the last answer without a request to the server. Nothing shows an error.</p>
        <div aria-live="polite" className="min-h-[1.5rem]">{fail && <p role="alert" className="bg-black/35 px-2 py-1">{fail}</p>}</div>
        <ul className="divide-y divide-white/25">
          {TIERS.slice().reverse().map(t => {
            const st = d.tiers[t]
            const admin = d.control.tierLocks[String(t)] as Level | undefined
            const cur: Level | 'auto' = admin ?? 'auto'
            const other = st.locked && !admin // tier 3 also goes off by itself when reactions use their share, or the older lock is on
            return (
              <li key={t} className="py-3 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-lg flex-1 min-w-[220px]">{TIER_NAME[t]}</span>
                  <span className="text-lg">{LEVEL_WORD[st.level]}{admin ? ' (set by an admin)' : other ? ' (held off by the reactions rules)' : ' (automatic)'}</span>
                </div>
                <p className="text-base opacity-90">{featuresOf(t).join(', ')}.{admin ? '' : ` ${other ? 'Reactions used their share of server time, or the older reactions lock is on.' : st.reason}`}</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Lock for tier ${t}`}>
                  {CHOICES.map(c => <button key={c.value} type="button" className="ops-btn px-3 py-1.5" aria-pressed={cur === c.value} disabled={busy === `${t}`} onClick={() => pick(t, c.value)}>{c.label}</button>)}
                </div>
                {confirm?.tier === t && (
                  <div className="bg-black/35 p-3 space-y-2" role="alert">
                    <p>Turning Tier 1 off stops sign-in and profile loading for everyone who is not already signed in. Do it?</p>
                    <div className="flex gap-2"><button type="button" className="ops-btn-red px-4 py-2" onClick={() => set(t, confirm.value)}>Turn it off</button><button type="button" className="ops-btn px-4 py-2" onClick={() => setConfirm(null)}>Leave it</button></div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {d.control.reactionsLocked && <p className="text-base">Reactions are also held off by the older &quot;Lock reactions&quot; switch on the Usage page.</p>}
        <p className="text-base opacity-90">Automatic steps up when the month is about {Math.round(d.control.thresholds[3].tight * 100)}% (Tier 3), {Math.round(d.control.thresholds[2].tight * 100)}% (Tier 2) and {Math.round(d.control.thresholds[1].critical * 100)}% (Tier 1) of the allowance, used or on track. Now at {Math.round(d.pressure * 100)}%. Every change is logged.</p>
      </div>
    </section>
  )
}
