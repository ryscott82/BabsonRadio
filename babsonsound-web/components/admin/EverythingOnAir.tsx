'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '@/lib/auth'
import { filterKinds, groupByDay, KIND_LABEL, KINDS, mergeOnAir, type FeedItem, type OnAirKind, type PendingItem } from '@/lib/everythingOnAir'

const time = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

/** Everything that will be on air in the next two weeks, in one list. Loads when opened. Nothing polls. */
export default function EverythingOnAir() {
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [pending, setPending] = useState<PendingItem[]>([])
  const [err, setErr] = useState('')
  const [on, setOn] = useState<Set<OnAirKind>>(new Set(KINDS))
  const [now] = useState(() => Date.now())

  useEffect(() => {
    apiGet<{ items: FeedItem[] }>('/api/schedule?days=14').then(r => setFeed(r.items)).catch(e => { setErr(e instanceof Error ? e.message : 'Could not load the schedule.'); setFeed([]) })
    apiGet<{ requests: PendingItem[] }>('/api/admin/slot-requests').then(r => setPending(r.requests)).catch(() => {})
  }, [])

  const days = useMemo(() => groupByDay(filterKinds(mergeOnAir(feed ?? [], pending, now), on)), [feed, pending, on, now])
  const toggle = (k: OnAirKind) => setOn(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div className="space-y-5">
      <fieldset className="flex flex-wrap gap-x-5 gap-y-1">
        <legend className="text-base mb-1">Show</legend>
        {KINDS.map(k => <label key={k} className="flex items-center gap-2 text-base text-br-dk-text min-h-11"><input type="checkbox" className="w-5 h-5" checked={on.has(k)} onChange={() => toggle(k)} />{KIND_LABEL[k]}</label>)}
      </fieldset>
      {err && <p role="alert" className="text-base text-br-red">{err}</p>}
      {!feed && <p className="text-base text-br-dk-sub">Loading…</p>}
      {feed && days.length === 0 && !err && <p className="text-base text-br-dk-sub">Nothing on air for the next two weeks.</p>}
      {days.map(d => (
        <section key={d.day} className="space-y-2" aria-label={d.day}>
          <h2 className="font-display text-br-gold tracking-widest text-lg">{d.day}</h2>
          <ul className="sk-raised rounded-xl divide-y divide-br-dk-border">
            {d.rows.map(r => (
              <li key={r.key} className={`px-4 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 ${r.kind === 'auto' ? 'opacity-70' : ''}`}>
                <span className="text-base text-br-dk-sub tabular-nums w-40 shrink-0">{time(r.startAt)} to {time(r.endAt)}</span>
                <span className="text-base text-br-dk-text flex-1 min-w-[10rem]">{r.title}{r.who ? <span className="text-br-dk-sub"> · {r.who}</span> : null}</span>
                <span className={`text-base font-semibold ${r.kind === 'pending' ? 'text-br-gold' : 'text-br-dk-sub'}`}>{r.kind === 'pending' ? (r.note === 'on hold' ? 'Pending (on hold)' : 'Pending') : KIND_LABEL[r.kind]}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
