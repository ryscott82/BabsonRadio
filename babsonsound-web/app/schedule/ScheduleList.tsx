'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { genreArt } from '@/lib/genreArt'
import { ErrorText } from '@/components/AuthUI'

interface Item {
  id: string; source: 'weekly' | 'slot' | 'auto' | 'event'; title: string; description: string; hosts: string[]
  imageUrl: string; category: string; format: 'show' | 'live' | 'prerecorded' | 'playlist'
  startAt: number; endAt: number; showSlug: string; reminderKey: string; color?: string
}

const FORMAT: Record<Item['format'], string> = { show: 'SHOW', live: 'LIVE', prerecorded: 'PRE-RECORDED', playlist: 'PLAYLIST' }
const DAY = 86_400_000
const HOUR_PX = 56            // height of one hour on the calendar
const DAYS_SHOWN = 3
const DAYS_LOADED = 28
const DAYS_BACK = 7   // how far back you can look
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Art({ item, className }: { item: Item; className: string }) {
  if (item.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.imageUrl} alt="" className={`${className} object-cover`} />
  }
  const a = genreArt(item.title)
  // A scheduler-picked color wins over the generic art.
  const background = a.background
  return (
    <div className={`${className} flex items-center justify-center`} style={{ background }}>
      <span className="font-display text-br-brass text-2xl">{a.initial}</span>
    </div>
  )
}

function Bell({ on, onClick, label, small }: { on: boolean; onClick: (e: React.MouseEvent) => void; label: string; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label}
            className={`sk-key rounded-full flex items-center justify-center shrink-0 text-br-dk-text ${small ? 'w-6 h-6' : 'w-9 h-9'}`}>
      <svg className={small ? 'w-3 h-3' : 'w-4 h-4'} viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" />
      </svg>
    </button>
  )
}

export default function ScheduleList() {
  const { user } = useAuth()
  const router = useRouter()
  const [bells, setBells] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Item | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [first, setFirst] = useState(() => startOfDay(Date.now())) // first of the three days shown
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = () => apiGet<{ items: Item[] }>(`/api/schedule?days=28&back=${DAYS_BACK}`)
      .then(r => { setItems(r.items); setNow(Date.now()) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load the schedule.'))
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!user) return
    apiGet<{ keys: string[] }>('/api/reminders').then(r => setBells(new Set(r.keys))).catch(() => {})
  }, [user])

  async function toggleBell(it: Item) {
    if (!user) { router.push('/auth'); return }
    const on = !bells.has(it.reminderKey)
    setBells(prev => { const n = new Set(prev); if (on) n.add(it.reminderKey); else n.delete(it.reminderKey); return n })
    setNote('')
    try {
      await api('/api/reminders', { key: it.reminderKey, on })
      setNote(on
        ? (it.source === 'auto'
            ? `You will be reminded 5 minutes before every ${it.title} block, on your iPhone (Babson Radio app, notifications allowed), not on this computer.`
            : `You will be reminded 5 minutes before ${it.title} on your iPhone (Babson Radio app, notifications allowed), not on this computer.`)
        : 'Reminder turned off.')
    } catch (e) {
      setBells(prev => { const n = new Set(prev); if (on) n.delete(it.reminderKey); else n.add(it.reminderKey); return n })
      setError(e instanceof Error ? e.message : 'Could not save the reminder.')
    }
  }

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  const ready = !!items?.length
  useEffect(() => {
    if (!ready || !scroller.current) return
    const today = startOfDay(Date.now())
    const hour = first === today ? Math.max(0, new Date().getHours() - 1) : 7
    scroller.current.scrollTop = hour * HOUR_PX
  }, [ready, first])

  if (error && !items) return <ErrorText>{error}</ErrorText>
  if (!items) return <p className="text-sm text-br-dk-sub">Loading…</p>
  if (!items.length) return <p className="text-sm text-br-dk-sub">Nothing is scheduled yet.</p>

  const today = startOfDay(now)
  const shown = Array.from({ length: DAYS_SHOWN }, (_, i) => first + i * DAY)
  const minDay = today - DAYS_BACK * DAY
  const canBack = first > minDay
  const canFwd = first + DAYS_SHOWN * DAY < today + DAYS_LOADED * DAY
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })
  const range = `${new Date(shown[0]).toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(shown[DAYS_SHOWN - 1]).toLocaleDateString([], { month: 'short', day: 'numeric' })}`

  return (
    <>
      <div className="sk-field rounded-xl px-4 py-2.5 text-xs text-br-dk-sub">
        Tap the bell on a show for an iPhone reminder 5 minutes before. Install the app and sign in. No iPhone? Use the calendar link above.
      </div>
      <ErrorText>{error}</ErrorText>
      {note && <p role="status" className="text-sm text-br-gold">{note}</p>}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setFirst(f => Math.max(minDay, f - DAY))} disabled={!canBack} aria-label="Previous day"
                  className="sk-key rounded-lg w-9 h-9 text-br-dk-text disabled:opacity-40">‹</button>
          <button onClick={() => setFirst(f => f + DAY)} disabled={!canFwd} aria-label="Next day"
                  className="sk-key rounded-lg w-9 h-9 text-br-dk-text disabled:opacity-40">›</button>
          <button onClick={() => setFirst(f => Math.max(minDay, f - 7 * DAY))} disabled={!canBack} aria-label="Previous week"
                  className="sk-key rounded-lg px-3 h-9 text-xs font-display tracking-widest text-br-dk-text disabled:opacity-40">‹ WEEK</button>
          <button onClick={() => setFirst(f => Math.min(today + (DAYS_LOADED - DAYS_SHOWN) * DAY, f + 7 * DAY))} disabled={!canFwd} aria-label="Next week"
                  className="sk-key rounded-lg px-3 h-9 text-xs font-display tracking-widest text-br-dk-text disabled:opacity-40">WEEK ›</button>
          <button onClick={() => setFirst(today)} disabled={first === today}
                  className="sk-key rounded-lg px-3 h-9 text-xs font-display tracking-widest text-br-dk-text disabled:opacity-40">TODAY</button>
        </div>
        <p className="font-display text-br-gold text-sm tracking-widest">{range.toUpperCase()}</p>
      </div>

      <div className="sk-raised rounded-xl overflow-hidden">
        <div className="grid grid-cols-[2.75rem_repeat(3,minmax(0,1fr))] border-b border-br-dk-border">
          <div />
          {shown.map(d => (
            <div key={d} className="py-2 text-center border-l border-br-dk-border">
              <p className={`font-display text-xs tracking-widest ${d === today ? 'text-br-gold' : 'text-br-dk-sub'}`}>
                {d === today ? 'TODAY' : new Date(d).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}
              </p>
              <p className="text-sm text-br-dk-text">{new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
            </div>
          ))}
        </div>

        <div ref={scroller} className="overflow-y-auto max-h-[68vh] lg:max-h-[calc(100dvh-17rem)]">
          <div className="grid grid-cols-[2.75rem_repeat(3,minmax(0,1fr))]" style={{ height: 24 * HOUR_PX }}>
            <div className="relative">
              {hours.map(h => (
                <span key={h} className="absolute right-1 text-[10px] text-br-dk-sub -translate-y-1/2"
                      style={{ top: h * HOUR_PX, display: h === 0 ? 'none' : undefined }}>{hourLabel(h)}</span>
              ))}
            </div>
            {shown.map(d => {
              const dayEnd = d + DAY
              const list = items.filter(it => it.startAt < dayEnd && it.endAt > d)
              return (
                <div key={d} className="relative border-l border-br-dk-border">
                  {hours.map(h => (
                    <div key={h} className="absolute inset-x-0 border-t border-br-dk-border/60" style={{ top: h * HOUR_PX }} />
                  ))}
                  {d === today && (
                    <div className="absolute inset-x-0 z-10 h-0.5 bg-br-red" style={{ top: ((now - d) / 3_600_000) * HOUR_PX }} />
                  )}
                  {list.map(it => {
                    const top = ((Math.max(it.startAt, d) - d) / 3_600_000) * HOUR_PX
                    const height = Math.max(((Math.min(it.endAt, dayEnd) - Math.max(it.startAt, d)) / 3_600_000) * HOUR_PX - 2, 22)
                    const live = it.startAt <= now && it.endAt > now
                    const tall = height >= 44
                    return (
                      <div key={it.id} role="button" tabIndex={0} onClick={() => setOpen(it)}
                           onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(it)}
                           className={`absolute inset-x-0.5 rounded-md px-1.5 py-1 overflow-hidden cursor-pointer text-left ${
                             it.source === 'auto' ? 'sk-field' : `sk-raised border-l-2 border-br-gold`} ${live ? 'ring-1 ring-br-red' : ''} ${it.endAt <= now ? 'opacity-55' : ''}`}
                           style={{
                             top: top + 1, height,
                             
                           }}>
                        <p className="text-xs leading-tight text-br-dk-text pr-6 line-clamp-2">{it.title}</p>
                        {tall && <p className="text-[10px] text-br-dk-sub truncate">{time(it.startAt)}{it.hosts.length ? ` · ${it.hosts[0]}` : ''}</p>}
                        {height >= 34 && it.endAt > now && (
                          <span className="absolute top-1 right-1">
                            <Bell small on={bells.has(it.reminderKey)} label={`Remind me before ${it.title}`}
                                  onClick={e => { e.stopPropagation(); toggleBell(it) }} />
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
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
              <button onClick={() => toggleBell(open)} aria-pressed={bells.has(open.reminderKey)}
                      className="sk-key rounded-xl w-full py-3 text-sm font-display tracking-[0.2em] text-br-dk-text">
                {bells.has(open.reminderKey) ? 'REMINDER ON' : 'REMIND ME 5 MINUTES BEFORE'}
              </button>
              <p className="text-[11px] text-br-dk-muted text-center -mt-2">Sent to the Babson Radio iPhone app, not this browser.</p>
              <button onClick={() => setOpen(null)} className="sk-key rounded-xl w-full py-3 text-sm font-display tracking-[0.2em] text-br-dk-text">CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
