'use client'

import { useMemo, useState } from 'react'
import { api } from '@/lib/auth'
import { quickSave, type FormErrors } from '@/lib/usageForm'
import type { UsageRow } from '@/lib/server/serverUsage'
import { fmtDay, fmtH, fmtWhen, todayLocal } from './format'

const field = 'ops-field w-full min-h-11'
const err = (m?: string) => (m ? <p role="alert" className="text-base mt-1 bg-black/35 px-2 py-1">{m}</p> : null)

/**
 * The few boxes at the very top: today's date and the four numbers Vercel's Usage page shows. One Save stores the reading (the same
 * POST and the same checks as the full form below) and the page reloads its meter and forecast. Shows the last reading entered, and when.
 */
export default function QuickEntry({ entries, onDone }: { entries: UsageRow[]; onDone: (msg: string) => void }) {
  const today = todayLocal()
  const [q, setQ] = useState({ date: today, cpu: '', edge: '', invocations: '', gb: '' })
  const [shown, setShown] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')
  const last = useMemo(() => entries.reduce<UsageRow | null>((a, e) => (!a || e.enteredAt > a.enteredAt ? e : a), null), [entries])
  const set = (k: keyof typeof q, v: string) => { setQ(p => ({ ...p, [k]: v })); setFail('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const r = quickSave(q, today, entries)
    if (!r.ok) { setShown(r.errors); return }
    setBusy(true); setFail(''); setShown({})
    try {
      await api('/api/admin/server-usage', r.body)
      setQ({ date: today, cpu: '', edge: '', invocations: '', gb: '' })
      onDone(`Saved the ${fmtDay(r.body.date)} reading.`)
    } catch (x) { setFail(x instanceof Error ? x.message : 'Could not save.') }
    setBusy(false)
  }

  return (
    <section aria-label="Quick entry" className="ops-card p-3 space-y-2">
      <form onSubmit={save} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_repeat(4,minmax(0,1fr))_auto] items-start">
        <label className="block">Date
          <input className={field} type="date" value={q.date} max={today} onChange={e => set('date', e.target.value)} aria-invalid={!!shown.date} />
          {err(shown.date)}
        </label>
        <label className="block">Active CPU
          <input className={field} inputMode="decimal" placeholder="1h 30m or 1.5" value={q.cpu} onChange={e => set('cpu', e.target.value)} aria-invalid={!!shown.cpu} />
          {err(shown.cpu)}
        </label>
        <label className="block">Edge requests
          <input className={field} inputMode="decimal" placeholder="1.2M" value={q.edge} onChange={e => set('edge', e.target.value)} aria-invalid={!!shown.edge} />
          {err(shown.edge)}
        </label>
        <label className="block">Function calls
          <input className={field} inputMode="decimal" placeholder="40K" value={q.invocations} onChange={e => set('invocations', e.target.value)} aria-invalid={!!shown.invocations} />
          {err(shown.invocations)}
        </label>
        <label className="block">Data transfer
          <input className={field} inputMode="decimal" placeholder="3.2 GB" value={q.gb} onChange={e => set('gb', e.target.value)} aria-invalid={!!shown.gb} />
          {err(shown.gb)}
        </label>
        <div className="sm:pt-7"><button type="submit" className="ops-btn px-6 min-h-11 w-full disabled:opacity-60" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
      <p className="text-base opacity-90">
        {last ? `Last reading: ${last.activeCpuHours === null ? 'no Active CPU' : `${fmtH(last.activeCpuHours)} h`} for ${fmtDay(last.date)}, entered ${fmtWhen(last.enteredAt)}.` : 'No readings yet.'}
        {' '}Fill in any of the four, you don&apos;t need all of them (the forecast uses Active CPU). Active CPU is Vercel&apos;s &ldquo;Fluid Active CPU&rdquo; for the billing period so far.
      </p>
      {fail && <p role="alert" className="bg-black/35 px-2 py-1 text-base">{fail}</p>}
    </section>
  )
}
