'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { SLOT_TYPES, type SlotType } from '@/lib/slots'
import { ErrorText } from '@/components/AuthUI'

interface Slot { id: string; title: string; hostName: string; type: SlotType; startAt: number; endAt: number }
interface Auto { id: string; label: string; startAt: number; endAt: number }

const day = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function UpcomingSlots() {
  const { user, isBabson, isDeveloper, loading } = useAuth()
  const member = !!user && (isBabson || isDeveloper)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [auto, setAuto] = useState<Auto[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet<{ blocks: Auto[] }>('/api/schedule/auto').then(r => setAuto(r.blocks)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!member) return
    apiGet<{ slots: Slot[] }>('/api/slots/schedule')
      .then(r => setSlots(r.slots))
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load the schedule.'))
  }, [member])

  type Item = { id: string; start: number; end: number; title: string; sub: string; auto: boolean }
  const items: Item[] = [
    ...(slots ?? []).map(x => ({ id: x.id, start: x.startAt, end: x.endAt, title: x.title, sub: `with ${x.hostName} · ${SLOT_TYPES[x.type]}`, auto: false })),
    ...auto.map(x => ({ id: `a${x.id}`, start: x.startAt, end: x.endAt, title: x.label, sub: 'On the radio', auto: true })),
  ].sort((p, q) => p.start - q.start)

  return (
    <section className="space-y-4">
      <h2 className="font-display text-br-gold tracking-widest text-sm">COMING UP</h2>
      {!loading && !member && (
        <p className="text-sm text-br-dk-sub">
          <Link href="/auth" className="text-br-gold">Sign in with your Babson email</Link> to see student shows that are booked.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      {items.length === 0 ? (
        <p className="text-sm text-br-dk-sub">
          Nothing is scheduled yet.{member && <> <Link href="/slots" className="text-br-gold">Request a spot</Link>.</>}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map(s => (
            <div key={s.id} className={`rounded-xl px-4 py-3 flex justify-between gap-4 ${s.auto ? 'sk-field' : 'sk-raised'}`}>
              <div>
                <p className="text-sm text-br-dk-text">{s.title}</p>
                <p className="text-xs text-br-dk-sub">{s.sub}</p>
              </div>
              <p className="text-xs text-br-dk-sub text-right shrink-0">{day(s.start)}<br />{time(s.start)} – {time(s.end)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
