'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'

interface Block { id: string; source: string; title: string; startAt: number; endAt: number }
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }

/**
 * What the auto DJ has coming up (now and next), for when no live shows are scheduled. Pass `items` when the page already
 * has the schedule; otherwise it loads the next two days itself.
 */
export default function AutoUpcoming({ items, limit = 5, className = '' }: { items?: Block[]; limit?: number; className?: string }) {
  const [own, setOwn] = useState<Block[] | null>(null)
  const [now, setNow] = useState(0)
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const t = setInterval(tick, 60_000); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (items) return
    apiGet<{ items: Block[] }>('/api/schedule?days=2&back=0').then(r => setOwn(r.items)).catch(() => setOwn([]))
  }, [items])
  const src = items ?? own
  if (!src || !now) return null
  const today = startOfDay(now)
  const list = src.filter(b => b.source === 'auto' && b.endAt > now).sort((a, b) => a.startAt - b.startAt).slice(0, limit)
  if (!list.length) return null
  const day = (ms: number) => {
    const d = startOfDay(ms)
    return d === today ? '' : d === today + 86_400_000 ? 'Tomorrow ' : new Date(ms).toLocaleDateString([], { weekday: 'short' }) + ' '
  }
  return (
    <div className={className}>
      <ul className="divide-y divide-br-dk-border">
        {list.map(b => {
          const onNow = b.startAt <= now
          return (
            <li key={b.id} className="flex items-center gap-4 py-3">
              <span className="w-28 shrink-0 font-bold text-br-gold text-sm tabular-nums">{onNow ? 'Now' : `${day(b.startAt)}${clock(b.startAt)}`}</span>
              <p className="min-w-0 flex-1 text-[15px] font-semibold text-br-dk-text truncate">{b.title}</p>
              <span className="text-sm hw-sub shrink-0">{onNow ? `until ${clock(b.endAt)}` : 'Music'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
