'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api } from '@/lib/auth'
import { useAuth } from '@/contexts/AuthContext'
import ConfirmDialog from '../ConfirmDialog'
import { actionLabel, standingFlag, strikeActions, type StrikeAction, type StrikeRow } from '@/lib/strikesAdmin'
import { holdBody, holdLabel } from '@/lib/slotWording'
import { approveAllBody, approveAllLabel, flagWords, isFlagged, moreWaiting, noteLine, resultLines, waitingFor, type ApproveResultRow, type PendingRow } from '@/lib/todayPage'

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** Pending show requests: why each one is waiting, Approve and Decline per row, and Approve all behind a confirm list that names every request. */
export default function NeedsApproval({ rows, total, strikes = [], onChanged }: { rows: PendingRow[] | null; total: number; strikes?: StrikeRow[]; onChanged: () => void }) {
  const { isAdmin } = useAuth()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [declining, setDeclining] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const [results, setResults] = useState<ApproveResultRow[] | null>(null)
  const [now] = useState(() => Date.now())

  async function hold(r: PendingRow) {
    setBusy(r.id); setErr('')
    try { await api('/api/slots/hold', holdBody(r.id, !r.held)); onChanged() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save that.') }
    setBusy('')
  }
  async function decide(r: PendingRow, action: 'approve' | 'decline') {
    setBusy(r.id); setErr('')
    try { await api('/api/slots/decision', { requestId: r.id, action, note: action === 'decline' ? note : '', connectionInfo: '' }); setDeclining(null); setNote(''); onChanged() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save that.') }
    setBusy('')
  }
  // A strike waiting for a decision: E-board, BabsonARTS and Admins confirm it (the person is emailed); only an Admin can excuse it.
  async function decideStrike(r: StrikeRow, action: StrikeAction) {
    setBusy(r.id); setErr('')
    try { await api('/api/admin/strikes/decide', { id: r.id, action, note: '' }); onChanged() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save that.') }
    setBusy('')
  }
  // The confirm box lists `shown` and the server gets exactly those ids, even if a poll changes `rows` while the box is open.
  const [shown, setShown] = useState<PendingRow[]>([])
  async function approveAll() {
    setBusy('all'); setErr('')
    try { const r = await api<{ results: ApproveResultRow[] }>('/api/admin/slots/approve-all', approveAllBody(shown)); setResults(r.results) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not approve them.') }
    setBusy('')
  }
  const close = () => { setAsking(false); setResults(null); setShown([]); onChanged() }

  const extra = rows ? moreWaiting(total, rows.length) : 0
  return (
    <section className="ops-card p-5 space-y-3 min-h-[10rem] min-w-0 lg:h-full lg:flex lg:flex-col" aria-label="Needs approval" aria-busy={!rows}>
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <h2 className="text-2xl font-light flex-1">Needs approval{rows && rows.length + strikes.length > 0 ? ` (${total + strikes.length})` : ''}</h2>
        {rows && rows.length > 1 && <button type="button" className="ops-btn px-4 min-h-11" onClick={() => { setShown(rows); setResults(null); setAsking(true) }}>Approve all</button>}
      </div>
      {!rows && <div className="space-y-3"><div className="h-6 w-full bg-white/25 motion-safe:animate-pulse" aria-hidden /><div className="h-6 w-2/3 bg-white/25 motion-safe:animate-pulse" aria-hidden /></div>}
      {rows && rows.length === 0 && strikes.length === 0 && <p className="text-base">Nothing is waiting.</p>}
      {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{err}</p>}
      <ul className="divide-y divide-white/25 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
        {rows?.map(r => (
          <li key={r.id} className="py-3 space-y-2">
            <p className="text-lg leading-snug">{r.title}</p>
            <p className="text-base opacity-90">{r.hostUid ? <Link href={`/admin/users/${encodeURIComponent(r.hostUid)}`} className="underline underline-offset-2">{r.hostName}</Link> : r.hostName} · {when(r.startAt)} · {r.durationMin} min</p>
            {standingFlag(r.strikes ?? 0) && <p className="text-base font-semibold">Standing: {standingFlag(r.strikes ?? 0)}</p>}
            <p className={`text-base ${waitingFor(r, now).auto ? 'opacity-90' : 'font-semibold'}`}>{waitingFor(r, now).text}</p>
            {noteLine(r) && <p className="text-base font-semibold">{noteLine(r)}</p>}
            {declining === r.id ? (
              <div className="space-y-2">
                <label className="block text-base">Note to the host (optional)
                  <input className="ops-field w-full min-h-11 mt-1" value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="ops-btn-red px-4 min-h-11 disabled:opacity-50" disabled={!!busy} onClick={() => decide(r, 'decline')}>Decline request</button>
                  <button type="button" className="ops-btn px-4 min-h-11" onClick={() => { setDeclining(null); setNote('') }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-50" disabled={!!busy} onClick={() => decide(r, 'approve')}>{busy === r.id ? 'Working…' : 'Approve'}</button>
                <button type="button" className="ops-btn-red px-4 min-h-11 disabled:opacity-50" disabled={!!busy} onClick={() => { setDeclining(r.id); setNote('') }}>Decline</button>
                <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-50" disabled={!!busy} onClick={() => hold(r)}>{holdLabel(!!r.held)}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {strikes.length > 0 && (
        <div className="shrink-0 space-y-2 border-t border-white/25 pt-3">
          <h3 className="text-xl font-light">Strikes ({strikes.length})</h3>
          <ul className="divide-y divide-white/25 max-h-72 overflow-y-auto">
            {strikes.map(s => (
              <li key={s.id} className="py-3 space-y-2">
                <p className="text-lg leading-snug"><Link href={`/admin/users/${encodeURIComponent(s.uid)}`} className="underline underline-offset-2">{s.name || '(no name)'}</Link><span className="text-base opacity-90"> · {s.reason}</span></p>
                <p className="text-base opacity-90">{when(s.at)}{s.note ? ` · ${s.note}` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {strikeActions(s.status, isAdmin).map(a => a === 'confirm'
                    ? <button key={a} type="button" className="ops-btn-red px-4 min-h-11 disabled:opacity-50" disabled={!!busy} onClick={() => decideStrike(s, a)}>{busy === s.id ? 'Working…' : 'Confirm strike'}</button>
                    : <button key={a} type="button" className="ops-btn px-4 min-h-11 disabled:opacity-50" disabled={!!busy} onClick={() => decideStrike(s, a)}>{actionLabel(s.status, a)}</button>)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {extra > 0 && <p className="text-base">{extra} more waiting. They show here once these are done, or open Show requests.</p>}

      {asking && !results && (
        <ConfirmDialog title="Approve every request listed?" action={approveAllLabel(shown.length)} busy={busy === 'all'} onNo={close} onYes={approveAll}
                       body={`This approves ${shown.length} show request${shown.length === 1 ? '' : 's'} and sends each host an email. The hosts and the audience are affected. Requests in a different color need a person to look first.`}>
          <ul className="space-y-2">
            {shown.map(r => (
              <li key={r.id} className={`p-2 text-base ${isFlagged(r) ? 'bg-white text-[#9d1c14]' : 'border border-white/40'}`}>
                <span className="font-semibold">{r.title}</span> · {r.hostName} · {when(r.startAt)}
                {isFlagged(r) && <span className="block font-semibold">Flag: {flagWords(r.flags).join(', ')}</span>}
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
      {asking && results && (
        <ConfirmDialog title="Approve all: results" onNo={close}>
          <ul className="space-y-2">
            {resultLines(shown, results).map(l => (
              <li key={l.id} className={`p-2 text-base ${l.ok ? 'border border-white/40' : 'bg-white text-[#9d1c14] font-semibold'}`}>{l.title}: {l.text}</li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </section>
  )
}
