'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'
import { badgeLine, fmtWhen, needsTraining, type BadgeRow } from '@/lib/membersPage'

interface Session { id: string; covers: string[]; title: string; startsAt: number; endsAt: number; location: string; capacity: number; trainerName: string; status: string; rsvpCount: number; me: { rsvp: boolean; checkedIn: boolean; removed: boolean } }

/** Badges with their end dates, and the training sessions you can RSVP to. "Get trained" when a badge is missing. Staff skip training. */
export default function TrainingCard({ badges, staff }: { badges: BadgeRow[]; staff: boolean }) {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (staff) return
    apiGet<{ sessions: Session[] }>('/api/studio/sessions').then(r => setSessions(r.sessions.filter(s => s.endsAt > now && (s.status === 'scheduled' || s.status === 'checkin_open')).sort((a, b) => a.startsAt - b.startsAt))).catch(e => { setErr(e instanceof Error ? e.message : 'Could not load sessions.'); setSessions([]) })
  }, [staff, now])

  async function rsvp(s: Session) {
    setBusy(s.id); setErr('')
    try {
      const want = !s.me.rsvp
      await api(`/api/studio/sessions/${s.id}/rsvp`, { rsvp: want })
      setSessions(list => (list ?? []).map(x => (x.id === s.id ? { ...x, me: { ...x.me, rsvp: want }, rsvpCount: x.rsvpCount + (want ? 1 : -1) } : x)))
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save your spot.') }
    setBusy('')
  }

  if (staff) return <p className="text-base text-br-dk-text">E-board and Admin do not need training. You can book the studio and host live.</p>
  const untrained = needsTraining(badges)
  return (
    <div className="space-y-4">
      <ul className="space-y-1">{badges.map(b => <li key={b.name} className={`text-base ${b.expired || !b.has ? 'text-br-dk-sub' : 'text-br-dk-text'}`}>{badgeLine(b)}</li>)}</ul>
      <ErrorText>{err}</ErrorText>
      {untrained && <p className="text-base text-br-dk-text">Get trained: RSVP to a session below. Radio training for live shows is on the <Link href="/training" className="text-br-gold underline underline-offset-4">host training page</Link>.</p>}
      {sessions && sessions.length === 0 && <p className="text-base text-br-dk-sub">No sessions are scheduled right now. <Link href="/studioaccess" className="text-br-gold underline underline-offset-4">Ask for training</Link>.</p>}
      {sessions && sessions.length > 0 && (
        <ul className="space-y-3" aria-label="Training sessions">
          {sessions.map(s => {
            const full = s.rsvpCount >= s.capacity && !s.me.rsvp
            return (
              <li key={s.id} className="sk-field rounded-xl p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-base text-br-dk-text">{s.title || 'Training session'}</p>
                  <p className="text-base text-br-dk-sub">{fmtWhen(s.startsAt)}{s.location ? ` · ${s.location}` : ''}{s.trainerName ? ` · ${s.trainerName}` : ''}</p>
                  <p className="text-base text-br-dk-sub">{Math.max(0, s.capacity - s.rsvpCount)} spots left</p>
                </div>
                {s.me.removed ? <span className="text-base text-br-dk-sub">Removed. Ask the trainer.</span>
                  : <button type="button" disabled={busy === s.id || full} onClick={() => rsvp(s)} aria-pressed={s.me.rsvp}
                            className={`rounded-lg px-4 min-h-11 text-base font-semibold ${s.me.rsvp ? 'sk-key text-br-gold ring-1 ring-br-gold' : 'sk-key text-br-dk-text'} disabled:opacity-50`}>
                      {s.me.rsvp ? 'Going (tap to cancel)' : full ? 'Full' : 'RSVP'}
                    </button>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
