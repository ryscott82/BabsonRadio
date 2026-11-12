'use client'

import { useEffect, useState } from 'react'
import { apiGetPublic } from '@/lib/auth'
import { fmtWhen } from '@/lib/membersPage'

interface Ev { id: string; title: string; startAt: number; endAt: number; place: string; details: string }

/** Club events from /api/events/club (public, cached for everyone). Loads when the page opens. */
export default function ClubEvents() {
  const [events, setEvents] = useState<Ev[] | null>(null)
  useEffect(() => { apiGetPublic<{ events: Ev[] }>('/api/events/club').then(r => setEvents(r.events)).catch(() => setEvents([])) }, [])
  if (!events) return <p className="text-base text-br-dk-sub">Loading…</p>
  if (!events.length) return <p className="text-base text-br-dk-sub">No club events are planned yet. Check back soon.</p>
  return (
    <ul className="space-y-3">
      {events.map(e => (
        <li key={e.id} className="sk-field rounded-xl p-4 space-y-1">
          <p className="text-lg text-br-dk-text">{e.title}</p>
          <p className="text-base text-br-dk-sub">{fmtWhen(e.startAt)}{e.place ? ` · ${e.place}` : ''}</p>
          {e.details && <p className="text-base text-br-dk-text whitespace-pre-wrap">{e.details}</p>}
        </li>
      ))}
    </ul>
  )
}
