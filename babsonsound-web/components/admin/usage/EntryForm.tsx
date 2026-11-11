'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/auth'
import { emptyForm, formFromEntry, parseForm, type FormErrors, type UsageForm } from '@/lib/usageForm'
import type { UsageRow } from '@/lib/server/serverUsage'
import { fmtDay, todayLocal } from './format'

const field = 'ops-field w-full'
const err = (m?: string) => (m ? <p role="alert" className="text-base mt-1 bg-black/35 px-2 py-1">{m}</p> : null)

// Add a reading, or change one (editing is set from the history list). Admins only: the server checks that too.
export default function EntryForm({ entries, editing, onDone, onCancel }: { entries: UsageRow[]; editing: UsageRow | null; onDone: (msg: string) => void; onCancel: () => void }) {
  const today = todayLocal()
  const [f, setF] = useState<UsageForm>(() => (editing ? formFromEntry(editing) : emptyForm(today)))
  const [shown, setShown] = useState<FormErrors>({}) // errors appear after Save is pressed, not while typing
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')
  const top = useRef<HTMLHeadingElement>(null)
  const id = editing?.id ?? null

  useEffect(() => { if (id) top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [id]) // the page remounts this form per entry (key), so it starts filled

  const others = useMemo(() => entries.filter(e => e.id !== id), [entries, id])
  const live = useMemo(() => parseForm(f, today, others), [f, today, others])
  const sameDay = others.some(e => e.date === f.date.trim())
  const set = <K extends keyof UsageForm>(k: K, v: UsageForm[K]) => { setF(p => ({ ...p, [k]: v })); setFail('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!live.ok || !live.entry) { setShown(live.errors); return }
    setBusy(true); setFail(''); setShown({})
    try {
      await api('/api/admin/server-usage', id ? { action: 'edit', id, ...live.entry } : { action: 'add', ...live.entry })
      setF(emptyForm(today))
      onDone(id ? `Saved changes to the ${fmtDay(live.entry.date)} reading.` : `Saved the ${fmtDay(live.entry.date)} reading.`)
    } catch (x) { setFail(x instanceof Error ? x.message : 'Could not save.') }
    setBusy(false)
  }

  const rows = f.routes
  return (
    <section className="space-y-3" aria-label="Enter usage">
      <h2 ref={top} className="text-2xl font-light scroll-mt-4">{id ? `Change the ${fmtDay(editing!.date)} reading` : 'Enter usage'}</h2>
      <form onSubmit={save} noValidate className="ops-card p-4 space-y-4">
        <p className="opacity-90">Numbers from Vercel&apos;s Usage page, for the billing period so far. You can paste them the way Vercel shows them.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">Date
            <input className={field} type="date" value={f.date} max={today} onChange={e => set('date', e.target.value)} aria-invalid={!!shown.date} />
            {err(shown.date)}
          </label>
          <label className="block">Active CPU (hours)
            <input className={field} inputMode="decimal" placeholder="1.5 or 1h 30m" value={f.cpu} onChange={e => set('cpu', e.target.value)} aria-invalid={!!shown.cpu} />
            {err(shown.cpu)}
          </label>
          <label className="block">Edge requests
            <input className={field} inputMode="decimal" placeholder="1204330 or 1.2M" value={f.edge} onChange={e => set('edge', e.target.value)} aria-invalid={!!shown.edge} />
            {err(shown.edge)}
          </label>
          <label className="block">Function invocations
            <input className={field} inputMode="decimal" placeholder="40000 or 40K" value={f.invocations} onChange={e => set('invocations', e.target.value)} aria-invalid={!!shown.invocations} />
            {err(shown.invocations)}
          </label>
          <label className="block">Fast data transfer (GB)
            <input className={field} inputMode="decimal" placeholder="3.2 or 800 MB" value={f.gb} onChange={e => set('gb', e.target.value)} aria-invalid={!!shown.gb} />
            {err(shown.gb)}
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-lg">Top routes (optional)</legend>
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 grid-cols-[minmax(0,1fr)_110px_auto]">
              <input className={field} aria-label={`Route ${i + 1}`} placeholder="/api/listen" value={r.route} onChange={e => set('routes', rows.map((x, j) => (j === i ? { ...x, route: e.target.value } : x)))} />
              <input className={field} aria-label={`CPU hours for route ${i + 1}`} inputMode="decimal" placeholder="hours" value={r.hours} onChange={e => set('routes', rows.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)))} />
              <button type="button" className="ops-btn px-3" aria-label={`Remove route ${i + 1}`} onClick={() => set('routes', rows.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          {err(shown.routes)}
          {rows.length < 20 && <button type="button" className="ops-btn px-3 py-1.5" onClick={() => set('routes', [...rows, { route: '', hours: '' }])}>Add a route</button>}
        </fieldset>

        <label className="block">Note (optional)
          <textarea className={`${field} min-h-[72px]`} maxLength={500} value={f.note} onChange={e => set('note', e.target.value)} />
          {err(shown.note)}
        </label>

        <div aria-live="polite" className="space-y-1">
          {live.ok && live.warnings.map(w => <p key={w} className="bg-black/35 px-2 py-1">{w}</p>)}
          {sameDay && <p className="bg-black/35 px-2 py-1">There is already a reading for this date. Saving adds another one; the last one entered is used.</p>}
          {fail && <p role="alert" className="bg-black/35 px-2 py-1">{fail}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="ops-btn px-5 py-2 disabled:opacity-60" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Save reading'}</button>
          {id && <button type="button" className="ops-btn px-5 py-2" onClick={onCancel} disabled={busy}>Cancel</button>}
        </div>
      </form>
    </section>
  )
}
