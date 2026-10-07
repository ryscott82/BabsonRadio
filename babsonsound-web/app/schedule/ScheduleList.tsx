'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { genreArt } from '@/lib/genreArt'
import { ErrorText } from '@/components/AuthUI'

interface Item {
  id: string; source: 'weekly' | 'slot' | 'auto'; title: string; description: string; hosts: string[]
  imageUrl: string; category: string; format: 'show' | 'live' | 'prerecorded' | 'playlist'
  startAt: number; endAt: number; showSlug: string; reminderKey: string
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

function Bell({ on, onClick, label }: { on: boolean; onClick: (e: React.MouseEvent) => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label}
            className="sk-key rounded-full w-9 h-9 flex items-center justify-center shrink-0 text-br-dk-text">
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}
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

  useEffect(() => {
    const load = () => apiGet<{ items: Item[] }>('/api/schedule?days=7')
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
            ? `You will be reminded 5 minutes before every ${it.title} block, in the Babson Radio app.`
            : `You will be reminded 5 minutes before ${it.title}, in the Babson Radio app.`)
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

  if (error && !items) return <ErrorText>{error}</ErrorText>
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
      <p className="text-sm text-br-dk-sub">Tap the bell on any show to get a reminder 5 minutes before it starts. Reminders arrive in the Babson Radio iPhone app.</p>
      <ErrorText>{error}</ErrorText>
      {note && <p role="status" className="text-sm text-br-gold">{note}</p>}
      <div className="space-y-10">
        {days.map(d => (
          <section key={d.key} className="space-y-3">
            <h2 className="font-display text-br-gold tracking-widest text-sm">{dayLabel(d.at, now)}</h2>
            {d.list.map(it => {
              const live = it.startAt <= now && it.endAt > now
              return (
                <div key={it.id} role="button" tabIndex={0} onClick={() => setOpen(it)}
                     onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(it)}
                     className={`w-full text-left flex items-center gap-3 p-3 rounded-xl cursor-pointer ${it.source === 'auto' ? 'sk-field' : 'sk-raised'}`}>
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
                  <Bell on={bells.has(it.reminderKey)} label={`Remind me before ${it.title}`}
                        onClick={e => { e.stopPropagation(); toggleBell(it) }} />
                </div>
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
              <button onClick={() => toggleBell(open)} aria-pressed={bells.has(open.reminderKey)}
                      className="sk-key rounded-xl w-full py-3 text-sm font-display tracking-[0.2em] text-br-dk-text">
                {bells.has(open.reminderKey) ? 'REMINDER ON' : 'REMIND ME 5 MINUTES BEFORE'}
              </button>
              <button onClick={() => setOpen(null)} className="sk-key rounded-xl w-full py-3 text-sm font-display tracking-[0.2em] text-br-dk-text">CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
