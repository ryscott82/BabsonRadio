'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '@/lib/auth'
import { genreArt } from '@/lib/genreArt'
import { ErrorText } from '@/components/AuthUI'

interface Item {
  id: string; source: 'weekly' | 'slot' | 'auto'; title: string; description: string; hosts: string[]
  imageUrl: string; category: string; format: 'show' | 'live' | 'prerecorded' | 'playlist'
  startAt: number; endAt: number; showSlug: string
}

const FORMAT: Record<Item['format'], string> = { show: 'SHOW', live: 'LIVE', prerecorded: 'PRE-RECORDED', playlist: 'PLAYLIST' }
const dayKey = (ms: number) => new Date(ms).toDateString()
const dayLabel = (ms: number, now: number) => {
  const d = new Date(ms)
  if (dayKey(ms) === dayKey(now)) return 'TODAY'
  if (dayKey(ms) === dayKey(now + 86_400_000)) return 'TOMORROW'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()
}
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Art({ item, className }: { item: Item; className: string }) {
  if (item.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.imageUrl} alt="" className={`${className} object-cover`} />
  }
  const a = genreArt(item.title)
  return (
    <div className={`${className} flex items-center justify-center`} style={{ background: a.background }}>
      <span className="font-display text-br-brass text-2xl">{a.initial}</span>
    </div>
  )
}

export default function ScheduleList() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Item | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const load = () => apiGet<{ items: Item[] }>('/api/schedule?days=7')
      .then(r => { setItems(r.items); setNow(Date.now()) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load the schedule.'))
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!items) return <p className="text-sm text-br-dk-sub">Loading…</p>
  if (!items.length) return <p className="text-sm text-br-dk-sub">Nothing is scheduled yet.</p>

  const days: { key: string; at: number; list: Item[] }[] = []
  for (const it of items) {
    const k = dayKey(it.startAt)
    const g = days.find(d => d.key === k)
    if (g) g.list.push(it); else days.push({ key: k, at: it.startAt, list: [it] })
  }

  return (
    <>
      <div className="space-y-10">
        {days.map(d => (
          <section key={d.key} className="space-y-3">
            <h2 className="font-display text-br-gold tracking-widest text-sm">{dayLabel(d.at, now)}</h2>
            {d.list.map(it => {
              const live = it.startAt <= now && it.endAt > now
              return (
                <button key={it.id} onClick={() => setOpen(it)} aria-pressed={false}
                        className={`w-full text-left flex items-center gap-4 p-3 rounded-xl ${it.source === 'auto' ? 'sk-field' : 'sk-raised'}`}>
                  <Art item={it} className="w-14 h-14 rounded-lg shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-br-dk-text truncate">{it.title}</p>
                    <p className="text-xs text-br-dk-sub truncate">
                      {it.hosts.length ? `with ${it.hosts.join(', ')} · ` : ''}{FORMAT[it.format]}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {live && <p className="font-display text-br-red text-[10px] tracking-widest">ON NOW</p>}
                    <p className="text-xs text-br-dk-sub">{time(it.startAt)} – {time(it.endAt)}</p>
                  </div>
                </button>
              )
            })}
          </section>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={open.title} onClick={e => e.stopPropagation()}
               className="sk-raised rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
            <Art item={open} className="w-full h-56" />
            <div className="p-5 space-y-3">
              <p className="font-display text-br-gold text-xs tracking-widest">
                {FORMAT[open.format]}{open.category ? ` · ${open.category.toUpperCase()}` : ''}
              </p>
              <h3 className="font-display text-br-dk-text text-3xl tracking-wide">{open.title}</h3>
              {open.hosts.length > 0 && <p className="text-sm text-br-dk-sub">with {open.hosts.join(', ')}</p>}
              <p className="text-sm text-br-dk-sub">
                {new Date(open.startAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}<br />
                {time(open.startAt)} – {time(open.endAt)}
              </p>
              {open.description && <p className="text-sm text-br-dk-text whitespace-pre-wrap">{open.description}</p>}
              {open.showSlug && <Link href={`/shows/${open.showSlug}`} className="inline-block text-sm text-br-gold">See the show</Link>}
              <button onClick={() => setOpen(null)} className="sk-key rounded-xl w-full py-3 text-sm font-display tracking-[0.2em] text-br-dk-text">CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
