'use client'

import { useState } from 'react'
import { api } from '@/lib/auth'
import ConfirmDialog from '../ConfirmDialog'
import { approveAllBody, approveAllLabel, flagWords, isFlagged, moreWaiting, resultLines, whyWaiting, type ApproveResultRow, type PendingRow } from '@/lib/todayPage'

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** Pending show requests: why each one is waiting, Approve and Decline per row, and Approve all behind a confirm list that names every request. */
export default function NeedsApproval({ rows, total, onChanged }: { rows: PendingRow[] | null; total: number; onChanged: () => void }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [declining, setDeclining] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const [results, setResults] = useState<ApproveResultRow[] | null>(null)
  const [now] = useState(() => Date.now())

  async function decide(r: PendingRow, action: 'approve' | 'decline') {
    setBusy(r.id); setErr('')
    try { await api('/api/slots/decision', { requestId: r.id, action, note: action === 'decline' ? note : '', connectionInfo: '' }); setDeclining(null); setNote(''); onChanged() }
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
    <section className="ops-card p-5 space-y-3 min-h-[10rem] min-w-0 xl:h-screen xl:flex xl:flex-col xl:!rounded-none" aria-label="Needs approval" aria-busy={!rows}>
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <h2 className="text-2xl font-light flex-1">Needs approval{rows && rows.length > 0 ? ` (${total})` : ''}</h2>
        {rows && rows.length > 1 && <button type="button" className="ops-btn px-4 min-h-11" onClick={() => { setShown(rows); setResults(null); setAsking(true) }}>Approve all</button>}
      </div>
      {!rows && <div className="space-y-3"><div className="h-6 w-full bg-white/25 motion-safe:animate-pulse" aria-hidden /><div className="h-6 w-2/3 bg-white/25 motion-safe:animate-pulse" aria-hidden /></div>}
      {rows && rows.length === 0 && <p className="text-base">Nothing is waiting.</p>}
      {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{err}</p>}
      <ul className="divide-y divide-white/25 xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
        {rows?.map(r => (
          <li key={r.id} className="py-3 space-y-2">
            <p className="text-lg leading-snug">{r.title}</p>
            <p className="text-base opacity-90">{r.hostName} · {when(r.startAt)} · {r.durationMin} min</p>
            <p className={`text-base ${isFlagged(r) ? 'font-semibold' : 'opacity-90'}`}>{whyWaiting(r, now, when)}</p>
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
                <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-50" disabled={!!busy} onClick={() => { setDeclining(r.id); setNote('') }}>Decline</button>
              </div>
            )}
          </li>
        ))}
      </ul>
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
