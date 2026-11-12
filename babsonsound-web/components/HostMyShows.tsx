'use client'

import { useState } from 'react'
import { api } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'
import { SLOT_TYPES, type SlotType } from '@/lib/slots'
import { autoHelp, autoLine, type AutoInfo } from '@/lib/slotWording'
import { LIVE_MAX_MINUTES } from '@/lib/studioBookCore'

export interface Mine extends AutoInfo {
  id: string; title: string; description: string; type: SlotType; category: string; audioURL: string; startAt: number; endAt: number; durationMin: number
  status: 'pending' | 'approved' | 'declined' | 'cancelled'; staffNote: string; connectionInfo: string; attachedRecordingId: string
}

const WORD: Record<Mine['status'], string> = { pending: 'Pending', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' }
const fmt = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
const btn = 'rounded-lg border border-br-dk-border text-br-dk-text text-base font-semibold px-4 min-h-11'

/** My shows: what happens next for each request, "Same time next week", the audio link, withdraw or cancel, and "Pick another time" after a decline. */
export default function HostMyShows({ items, maxRepeatWeeks, onChanged, onPickAnother, now }: {
  items: Mine[]; maxRepeatWeeks: number; onChanged: () => Promise<void> | void; onPickAnother: (m: Mine) => void; now: number
}) {
  const [cancelling, setCancelling] = useState('')
  const [reason, setReason] = useState('')
  const [audio, setAudio] = useState<{ id: string; url: string } | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(''); setNote('')
    try { await fn(); await onChanged() } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.') }
    setBusy(false)
  }
  const repeat = (m: Mine, weeks: number) => run(async () => {
    const r = await api<{ ids?: string[]; skipped?: unknown[] }>('/api/slots/repeat', { requestId: m.id, weeks })
    const n = r.ids?.length ?? 0, s = r.skipped?.length ?? 0
    setNote(`${n} ${n === 1 ? 'week' : 'weeks'} requested${s ? `, ${s} skipped (taken or too soon)` : ''}.`)
  })

  return (
    <section id="mine" className="space-y-3 scroll-mt-24" aria-label="My shows">
      <h2 className="font-display text-br-gold tracking-widest text-lg">My shows</h2>
      {items.length === 0 && <p className="text-base text-br-dk-sub">You have not requested a show yet.</p>}
      <ErrorText>{err}</ErrorText>
      {note && <p role="status" className="text-base text-br-gold">{note}</p>}
      {items.map(r => {
        const future = r.startAt > now
        const canRepeat = (r.status === 'pending' || r.status === 'approved') && (r.type !== 'live' || r.durationMin <= LIVE_MAX_MINUTES)
        return (
          <div key={r.id} className="sk-raised rounded-xl p-4 space-y-2">
            <div className="flex justify-between gap-4">
              <p className="text-lg text-br-dk-text">{r.title}</p>
              <span className={`font-display text-base tracking-widest ${r.status === 'declined' ? 'text-br-red' : r.status === 'approved' ? 'text-br-green' : 'text-br-dk-sub'}`}>{WORD[r.status]}</span>
            </div>
            <p className="text-base text-br-dk-sub">{fmt(r.startAt)} · {r.durationMin} min · {SLOT_TYPES[r.type]}</p>
            {r.status === 'pending' && (
              <div>
                <p className="text-base text-br-dk-text">{autoLine(r, now, fmt)}</p>
                {autoHelp(r, now, 'student') && <p className="text-base text-br-dk-sub">{autoHelp(r, now, 'student')}</p>}
              </div>
            )}
            {r.staffNote && <p className="text-base text-br-dk-text">Staff note: {r.staffNote}</p>}
            {r.attachedRecordingId && <p className="text-base text-br-green">Recording attached. It plays at air time.</p>}
            {r.status === 'approved' && r.connectionInfo && <pre className="sk-field rounded-lg p-3 text-base text-br-dk-text whitespace-pre-wrap">{r.connectionInfo}</pre>}

            <div className="flex flex-wrap gap-2">
              {r.status === 'declined' && <button type="button" onClick={() => onPickAnother(r)} className="sk-key rounded-lg px-4 min-h-11 text-base font-semibold text-br-gold">Pick another time</button>}
              {canRepeat && future && <button type="button" disabled={busy || maxRepeatWeeks < 1} onClick={() => repeat(r, 1)} className={btn}>Same time next week</button>}
              {canRepeat && future && maxRepeatWeeks > 1 && <button type="button" disabled={busy} onClick={() => repeat(r, maxRepeatWeeks)} className={btn}>Repeat {maxRepeatWeeks} more weeks</button>}
              {r.type === 'prerecorded' && future && (r.status === 'pending' || r.status === 'approved') && <button type="button" onClick={() => setAudio({ id: r.id, url: r.audioURL })} className={btn}>{r.audioURL ? 'Change audio link' : 'Add audio link'}</button>}
            </div>

            {audio?.id === r.id && (
              <div className="flex flex-wrap gap-2 items-center">
                <input type="url" value={audio.url} onChange={e => setAudio({ id: r.id, url: e.target.value })} placeholder="https://…" aria-label="Audio link"
                       className="sk-field rounded-xl px-4 py-3 text-base text-br-dk-text flex-1 min-w-[14rem] focus:outline-none" />
                <button type="button" disabled={busy || !audio.url.trim()} onClick={() => run(async () => { await api('/api/slots/update', { requestId: r.id, audioURL: audio.url.trim() }); setAudio(null); setNote('Audio link saved.') })} className="sk-key rounded-lg px-4 min-h-11 text-base text-br-gold">Save</button>
              </div>
            )}

            {(r.status === 'pending' || r.status === 'approved') && future && (
              cancelling === r.id ? (
                <div className="space-y-2">
                  <input className="sk-field w-full rounded-xl px-4 py-3 text-base text-br-dk-text" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Reason (optional), helps us plan" />
                  <div className="flex gap-3 items-center">
                    <button type="button" disabled={busy} onClick={() => run(async () => { await api('/api/slots/cancel', { requestId: r.id, reason }); setCancelling(''); setReason('') })} className="rounded-lg bg-br-red text-white text-base font-semibold px-4 min-h-11">Confirm cancel</button>
                    <button type="button" onClick={() => { setCancelling(''); setReason('') }} className="text-base text-br-dk-sub min-h-11 px-2">Keep my show</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setCancelling(r.id)} className="rounded-lg border border-br-red text-br-red text-base font-semibold px-4 min-h-11">{r.status === 'approved' ? 'Cancel this show' : 'Withdraw request'}</button>
              )
            )}
          </div>
        )
      })}
    </section>
  )
}
