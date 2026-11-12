'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import { actionLabel, decidedStrikes, manualAddProblem, pendingStrikes, STATUS_WORD, strikeActions, uidOfPerson, type StrikeAction, type StrikeRow } from '@/lib/strikesAdmin'
import type { Suggestion } from '@/lib/guestPicker'

const when = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

/**
 * Strikes for the E-board. `pendingOnly` is the small version inside Notifications (only what waits for a decision); the Strikes page also shows
 * the decided ones and a manual add. Loads once when opened and after each decision. Nothing polls.
 */
export default function StrikesPanel({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const [rows, setRows] = useState<StrikeRow[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [excusing, setExcusing] = useState('')
  const [note, setNote] = useState('')
  const load = useCallback(() => { apiGet<{ strikes: StrikeRow[] }>('/api/admin/strikes').then(r => setRows(r.strikes)).catch(e => { setErr(e instanceof Error ? e.message : 'Could not load strikes.'); setRows([]) }) }, [])
  useEffect(() => { queueMicrotask(load) }, [load])

  async function decide(r: StrikeRow, action: StrikeAction) {
    setBusy(r.id); setErr('')
    try { await api('/api/admin/strikes/decide', { id: r.id, action, note: action === 'excuse' ? note : '' }); setExcusing(''); setNote(''); load() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save that.') }
    setBusy('')
  }

  if (!rows) return <section className="ops-card p-5 min-h-[6rem]" aria-busy="true"><h2 className="text-2xl font-light">Strikes</h2></section>
  const pending = pendingStrikes(rows)
  if (pendingOnly && pending.length === 0) return null
  const decided = decidedStrikes(rows)

  const rowView = (r: StrikeRow) => (
    <li key={r.id} className="py-3 space-y-2">
      <p className="text-lg leading-snug">{r.name || '(no name)'}<span className="text-base opacity-90"> · {r.reason}</span></p>
      <p className="text-base opacity-90">{when(r.at)} · {STATUS_WORD[r.status] ?? r.status}{r.note ? ` · ${r.note}` : ''}</p>
      {strikeActions(r.status).length > 0 && (excusing === r.id ? (
        <div className="space-y-2">
          <label className="block text-base">Note (optional)
            <input className="ops-field w-full min-h-11 mt-1" value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-50" disabled={busy === r.id} onClick={() => decide(r, 'excuse')}>{actionLabel(r.status, 'excuse')}</button>
            <button type="button" className="ops-btn px-4 min-h-11" onClick={() => { setExcusing(''); setNote('') }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {strikeActions(r.status).map(a => a === 'confirm'
            ? <button key={a} type="button" className="ops-btn-red px-4 min-h-11 disabled:opacity-50" disabled={busy === r.id} onClick={() => decide(r, 'confirm')}>{busy === r.id ? 'Working…' : actionLabel(r.status, a)}</button>
            : <button key={a} type="button" className="ops-btn px-4 min-h-11" onClick={() => { setExcusing(r.id); setNote('') }}>{actionLabel(r.status, a)}</button>)}
        </div>
      ))}
    </li>
  )

  return (
    <div className="space-y-6">
      <section className="ops-card p-5 space-y-3" aria-label="Strikes waiting">
        <h2 className="text-2xl font-light">{pendingOnly ? 'Strikes to review' : 'Waiting for a decision'}</h2>
        {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{err}</p>}
        {pending.length === 0 ? <p className="text-base">Nothing is waiting. Missed shows show up here when the site spots one.</p>
          : <ul className="divide-y divide-white/25">{pending.map(rowView)}</ul>}
        {pendingOnly && <p className="text-base"><a href="/admin/strikes" className="underline underline-offset-2">Open Strikes</a></p>}
      </section>
      {!pendingOnly && <ManualAdd onAdded={load} />}
      {!pendingOnly && decided.length > 0 && (
        <section className="ops-card p-5 space-y-3" aria-label="Decided strikes">
          <h2 className="text-2xl font-light">Decided</h2>
          <ul className="divide-y divide-white/25">{decided.map(rowView)}</ul>
        </section>
      )}
    </div>
  )
}

/** Add a strike by hand: find the member by name, write a note. It waits for a decision like any other, unless "confirm now" is ticked. */
function ManualAdd({ onAdded }: { onAdded: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Suggestion[]>([])
  const [person, setPerson] = useState<Suggestion | null>(null)
  const [note, setNote] = useState('')
  const [now2, setNow2] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = q.trim()
    if (person || t.length < 2) { queueMicrotask(() => setResults([])); return }
    const id = setTimeout(() => { apiGet<{ results: Suggestion[] }>(`/api/people/suggest?q=${encodeURIComponent(t)}`).then(r => setResults(r.results.filter(x => x.id.startsWith('u:')))).catch(() => setResults([])) }, 250)
    return () => clearTimeout(id)
  }, [q, person])

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    const p = manualAddProblem(person?.id ?? '', note)
    if (p) { setErr(p); return }
    setBusy(true)
    try { await api('/api/admin/strikes/add', { uid: uidOfPerson(person!.id), note: note.trim(), confirm: now2 }); setMsg(now2 ? 'Added and confirmed.' : 'Added. It is waiting for a decision.'); setPerson(null); setQ(''); setNote(''); setNow2(false); onAdded() }
    catch (er) { setErr(er instanceof Error ? er.message : 'Could not add that.') }
    setBusy(false)
  }

  return (
    <section className="ops-card p-5 space-y-3" aria-label="Add a strike">
      <h2 className="text-2xl font-light">Add a strike</h2>
      <form onSubmit={add} className="space-y-3">
        {person ? (
          <p className="text-base">{person.name} <span className="opacity-90">({person.emailMasked})</span> <button type="button" className="underline underline-offset-2 ml-2" onClick={() => setPerson(null)}>Change</button></p>
        ) : (
          <div>
            <label className="block text-base">Member
              <input className="ops-field w-full min-h-11 mt-1" value={q} onChange={e => setQ(e.target.value)} placeholder="Start typing a name" autoComplete="off" />
            </label>
            {results.length > 0 && (
              <ul className="mt-1 divide-y divide-white/25 border border-white/30" role="listbox" aria-label="Members">
                {results.map(r => <li key={r.id} role="option" aria-selected={false}><button type="button" className="w-full text-left px-3 py-2 min-h-11 text-base" onClick={() => { setPerson(r); setResults([]) }}>{r.name} <span className="opacity-90">{r.emailMasked}</span></button></li>)}
              </ul>
            )}
          </div>
        )}
        <label className="block text-base">Note
          <input className="ops-field w-full min-h-11 mt-1" value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="What happened" />
        </label>
        <label className="flex items-center gap-3 text-base min-h-11"><input type="checkbox" className="w-5 h-5" checked={now2} onChange={e => setNow2(e.target.checked)} />Confirm it now (no email is sent)</label>
        {err && <p role="alert" className="text-base font-semibold">{err}</p>}
        {msg && <p role="status" className="text-base">{msg}</p>}
        <button type="submit" disabled={busy} className="ops-btn px-5 min-h-11 disabled:opacity-50">Add strike</button>
      </form>
    </section>
  )
}
