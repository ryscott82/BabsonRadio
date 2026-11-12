'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiDelete, apiGet } from '@/lib/auth'
import { eventProblem, toInput } from '@/lib/strikesAdmin'

interface Ev { id: string; title: string; startAt: number; endAt: number; place: string; details: string }
const when = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// Club events: add, edit and remove the events shown on the Members page. E-board and Admin. Loads when opened and after each change.
export default function ClubEventsPage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [place, setPlace] = useState('')
  const [details, setDetails] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState('')

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  const load = useCallback(() => { apiGet<{ events: Ev[] }>('/api/events/club').then(r => setEvents(r.events)).catch(e => { setErr(e instanceof Error ? e.message : 'Could not load events.'); setEvents([]) }) }, [])
  useEffect(() => { if (user && isDirector) queueMicrotask(load) }, [user, isDirector, load])

  const reset = () => { setId(''); setTitle(''); setStart(''); setEnd(''); setPlace(''); setDetails('') }
  function edit(e: Ev) { setId(e.id); setTitle(e.title); setStart(toInput(e.startAt)); setEnd(toInput(e.endAt)); setPlace(e.place); setDetails(e.details); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const d = { title, startAt: new Date(start).getTime(), endAt: new Date(end).getTime(), place, details }
    const p = eventProblem(d)
    if (p) { setErr(p); return }
    setBusy(true)
    try { await api('/api/events/club', { ...d, ...(id ? { id } : {}) }); reset(); load() } catch (er) { setErr(er instanceof Error ? er.message : 'Could not save.') }
    setBusy(false)
  }
  async function remove(ev: Ev) {
    setBusy(true); setErr('')
    try { await apiDelete(`/api/events/club?id=${encodeURIComponent(ev.id)}`, {}); setAsking(''); if (id === ev.id) reset(); load() } catch (er) { setErr(er instanceof Error ? er.message : 'Could not delete.') }
    setBusy(false)
  }

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />
  const field = 'ops-field w-full min-h-11 mt-1'
  return (
    <div className="px-5 lg:px-8 py-6 space-y-6 max-w-4xl">
      <h1 className="text-4xl font-light leading-tight">Club events</h1>
      <section className="ops-card p-5 space-y-3" aria-label={id ? 'Edit event' : 'Add event'}>
        <h2 className="text-2xl font-light">{id ? 'Edit event' : 'Add an event'}</h2>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-base">Title<input className={field} value={title} maxLength={100} onChange={e => setTitle(e.target.value)} /></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-base">Starts<input type="datetime-local" className={field} value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="block text-base">Ends<input type="datetime-local" className={field} value={end} onChange={e => setEnd(e.target.value)} /></label>
          </div>
          <label className="block text-base">Place (optional)<input className={field} value={place} maxLength={120} onChange={e => setPlace(e.target.value)} /></label>
          <label className="block text-base">Details (optional)<textarea className={`${field} py-2`} rows={3} value={details} maxLength={1000} onChange={e => setDetails(e.target.value)} /></label>
          {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{err}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="ops-btn px-5 min-h-11 disabled:opacity-50">{id ? 'Save changes' : 'Add event'}</button>
            {id && <button type="button" className="ops-btn px-5 min-h-11" onClick={reset}>Cancel</button>}
          </div>
        </form>
      </section>
      <section className="ops-card p-5 space-y-3" aria-label="Upcoming events">
        <h2 className="text-2xl font-light">Upcoming</h2>
        {!events && <p className="text-base">Loading…</p>}
        {events && events.length === 0 && <p className="text-base">No events yet.</p>}
        <ul className="divide-y divide-white/25">
          {events?.map(ev => (
            <li key={ev.id} className="py-3 space-y-2">
              <p className="text-lg leading-snug">{ev.title}</p>
              <p className="text-base opacity-90">{when(ev.startAt)} to {when(ev.endAt)}{ev.place ? ` · ${ev.place}` : ''}</p>
              {asking === ev.id ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-base">Delete this event? It cannot be undone.</span>
                  <button type="button" className="ops-btn-red px-4 min-h-11" disabled={busy} onClick={() => remove(ev)}>Delete</button>
                  <button type="button" className="ops-btn px-4 min-h-11" onClick={() => setAsking('')}>Keep</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className="ops-btn px-4 min-h-11" onClick={() => edit(ev)}>Edit</button>
                  <button type="button" className="ops-btn-red px-4 min-h-11" onClick={() => setAsking(ev.id)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
