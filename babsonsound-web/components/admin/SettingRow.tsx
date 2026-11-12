'use client'

import { useEffect, useId, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import {
  canReset, confirmText, formatValue, fromInput, isChanged, needsConfirm, toInput, validate, valueToSend,
  type SettingDef, type SettingValue,
} from '@/lib/settingRow'

const HOURS = Array.from({ length: 24 }, (_, h) => h)

/**
 * One setting: its name, a plain-language help line, the value now and the default, a Changed badge, Reset to default,
 * and (for values that can hurt every listener) a confirm step that says who is affected. `value` is what the server has stored;
 * `onSave` saves one value and throws the server's message when it refuses. Reset to default calls `onSave(null)` (the server puts the
 * default back). Nothing is saved until Save (or Reset) is pressed. `meta` says who last changed it and when.
 */
export default function SettingRow({ def, value, onSave, highlight = false, meta }: {
  def: SettingDef; value: SettingValue | undefined; onSave: (next: SettingValue | null) => Promise<void>; highlight?: boolean
  meta?: { changedAt: number | null; changedBy: string | null }
}) {
  const uid = useId()
  const rowRef = useRef<HTMLElement>(null)
  const [draft, setDraft] = useState<SettingValue | string | null>(null) // null: not being edited, the box shows the stored value
  const [asking, setAsking] = useState<{ value: SettingValue | null } | null>(null) // what waits for a yes in the confirm step (null inside = Reset)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { if (highlight) rowRef.current?.scrollIntoView({ block: 'center' }) }, [highlight])

  const loaded = value !== undefined
  const shown = draft ?? (loaded ? (def.kind === 'number' ? toInput(def, value) : value) : '')
  const next: SettingValue | null = def.kind === 'number' ? fromInput(def, String(shown)) : def.kind === 'boolean' ? shown === true : def.kind === 'hour' ? Number(shown) : String(shown)
  const problem = draft === null ? null : validate(def, next)
  const dirty = draft !== null && next !== null && next !== value
  const changed = isChanged(def, value)

  async function commit(v: SettingValue | null) {
    setBusy(true); setErr(''); setMsg('')
    try { await onSave(v); setDraft(null); setMsg('Saved.') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false); setAsking(null)
  }
  function request(v: SettingValue | null) {
    setErr(''); setMsg('')
    if (needsConfirm(def)) setAsking({ value: v }); else void commit(v)
  }

  const field = 'ops-field w-full sm:w-64 min-h-11'
  const q = asking === null ? null : confirmText(def, asking.value ?? def.default, value)
  return (
    <section ref={rowRef} id={`setting-${def.id}`} aria-labelledby={`${uid}-l`} className={`ops-card p-4 space-y-3 min-w-0 ${highlight ? 'outline outline-2 outline-white' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id={`${uid}-l`} className="text-xl font-light leading-tight">{def.label}</h3>
        {changed && <span className="px-2 py-0.5 text-base font-semibold bg-white text-[#0f5233]">Changed</span>}
      </div>
      <p className="text-base opacity-90">{def.help}</p>
      {def.notEnforced && <p className="text-base font-semibold">Not enforced right now. Changing it does nothing today.</p>}
      {changed && meta?.changedAt ? <p className="text-base opacity-90">Changed{meta.changedBy ? ` by ${meta.changedBy}` : ''} on {new Date(meta.changedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p> : null}
      <p className="text-base"><span className="opacity-90">Now:</span> <strong className="font-semibold">{formatValue(def, value)}</strong><span className="opacity-90"> · Recommended: </span>{formatValue(def, def.default)}</p>

      <div className="flex flex-wrap items-center gap-3">
        {def.kind === 'number' && (
          <label className="flex items-center gap-2 text-base">
            <span className="sr-only">{def.label}</span>
            <input type="number" inputMode="decimal" className={field} value={shown as string} disabled={!loaded || busy}
                   min={def.min !== undefined ? def.min * (def.scale ?? 1) : undefined} max={def.max !== undefined ? def.max * (def.scale ?? 1) : undefined} step="any"
                   aria-invalid={!!problem} aria-describedby={problem ? `${uid}-e` : undefined}
                   onChange={e => { setDraft(e.target.value); setMsg(''); setErr('') }} />
            {def.unit && <span>{def.unit}</span>}
          </label>
        )}
        {def.kind === 'boolean' && (
          <label className="flex items-center gap-3 text-base min-h-11">
            <input type="checkbox" className="h-6 w-6" checked={shown === true} disabled={!loaded || busy}
                   onChange={e => { setDraft(e.target.checked); setMsg(''); setErr('') }} />
            {shown === true ? 'On' : 'Off'}
          </label>
        )}
        {def.kind === 'hour' && (
          <select aria-label={def.label} className={field} value={String(shown)} disabled={!loaded || busy} onChange={e => { setDraft(e.target.value); setMsg(''); setErr('') }}>
            {HOURS.map(h => <option key={h} value={h}>{formatValue(def, h)}</option>)}
          </select>
        )}
        {def.kind === 'choice' && (
          <select aria-label={def.label} className={field} value={String(shown)} disabled={!loaded || busy} onChange={e => { setDraft(e.target.value); setMsg(''); setErr('') }}>
            {def.choices?.filter(c => c.value !== 'custom' || value === 'custom').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        )}
        <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-50" disabled={busy || !dirty || !!problem}
                onClick={() => next !== null && request(valueToSend(next, false))}>{busy ? 'Saving…' : 'Save'}</button>
        {draft !== null && <button type="button" className="ops-btn px-4 min-h-11" disabled={busy} onClick={() => { setDraft(null); setErr('') }}>Undo</button>}
        {canReset(def, value) && <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-50" disabled={busy} onClick={() => request(valueToSend(def.default, true))}>Reset to recommended</button>}
      </div>

      <div className="min-h-6" aria-live="polite">
        {problem && <p id={`${uid}-e`} role="alert" className="text-base font-semibold">{problem}</p>}
        {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{err}</p>}
        {msg && !err && <p role="status" className="text-base font-semibold">{msg}</p>}
      </div>

      {q && <ConfirmDialog title={q.title} body={q.body} action={q.action} busy={busy} onNo={() => setAsking(null)} onYes={() => void commit(asking?.value ?? null)} />}
    </section>
  )
}
