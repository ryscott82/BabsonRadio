'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import ImagePicker from '@/components/ImagePicker'
import ColorPicker from '@/components/ColorPicker'

interface Show {
  id: string; showName: string; dayOfWeek: number; startTime: string; endTime: string; description: string
  hostNames: string[]; hostUsernames: string[]; category: string; color: string; imageUrl: string; imagePath: string; showSlug: string; isActive: boolean
  repeat: 'weekly' | 'biweekly' | 'monthly' | 'dates'; anchor: string; weeks: number[]; dates: string[]
}

interface Ev {
  id: string; title: string; date: string; startTime: string; endTime: string; description: string
  hostNames: string[]; category: string; color: string; imageUrl: string; imagePath: string; isActive: boolean
  trackTitle: string; trackArtist: string; nextTitle: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const CATEGORIES = ['', 'music', 'talk', 'interview', 'news', 'podcast', 'other']
const blank = (): Show => ({ id: '', showName: '', dayOfWeek: 1, startTime: '20:00', endTime: '21:00', description: '',
  hostNames: [], hostUsernames: [], category: '', color: '', imageUrl: '', imagePath: '', showSlug: '', isActive: true, repeat: 'weekly', anchor: '', weeks: [], dates: [] })
const today = () => new Date().toLocaleDateString('en-CA')
const blankEv = (): Ev => ({ id: '', title: '', date: today(), startTime: '20:00', endTime: '21:00', description: '',
  hostNames: [], category: '', color: '', imageUrl: '', imagePath: '', isActive: true, trackTitle: '', trackArtist: '', nextTitle: '' })

export default function AdminSchedulePage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [shows, setShows] = useState<Show[]>([])
  const [edit, setEdit] = useState<Show | null>(null)
  const [events, setEvents] = useState<Ev[]>([])
  const [editEv, setEditEv] = useState<Ev | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setShows((await apiGet<{ shows: Show[] }>('/api/admin/schedule')).shows) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the schedule.') }
    try { setEvents((await apiGet<{ events: Ev[] }>('/api/admin/events')).events) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load events.') }
  }, [])

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace('/') }, [loading, user, isDirector, router])
  useEffect(() => { if (user && isDirector) queueMicrotask(load) }, [user, isDirector, load])

  if (!user || !isDirector) return null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/admin/schedule', { action: 'save', ...edit })
      setEdit(null); setNotice('Saved.'); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.') }
    setBusy(false)
  }
  async function saveEv(e: React.FormEvent) {
    e.preventDefault()
    if (!editEv) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/admin/events', { action: 'save', ...editEv })
      setEditEv(null); setNotice('Event saved.'); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.') }
    setBusy(false)
  }
  async function removeEv(ev: Ev) {
    if (!confirm(`Delete "${ev.title}"?`)) return
    setError('')
    try { await api('/api/admin/events', { action: 'delete', id: ev.id }); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete.') }
  }
  async function remove(s: Show) {
    if (!confirm(`Delete "${s.showName}" from the weekly schedule?`)) return
    setError('')
    try { await api('/api/admin/schedule', { action: 'delete', id: s.id }); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete.') }
  }

  const box = 'sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none'
  const lab = 'block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest'

  return (
    <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Weekly schedule</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <button onClick={() => { setEdit(blank()); setNotice('') }}
                className="sk-btn font-display tracking-widest text-xs px-4 py-2 rounded-lg shrink-0">Add show</button>
      </div>
      <p className="text-sm text-br-dk-sub">
        Shows that air every week. Student requests and the auto-scheduler fill in around these, and the app,
        website and calendar all update from this list.
      </p>
      <ErrorText>{error}</ErrorText>
      {notice && <p className="text-sm text-br-gold">{notice}</p>}

      {edit && (
        <form onSubmit={save} className="sk-raised rounded-2xl p-5 space-y-4">
          <Field label="Show name" value={edit.showName} onChange={e => setEdit({ ...edit, showName: e.target.value })} maxLength={80} required />
          <label className="block"><span className={lab}>How often</span>
            <select className={box} value={edit.repeat} onChange={e => setEdit({ ...edit, repeat: e.target.value as Show['repeat'] })}>
              <option value="weekly">Every week</option>
              <option value="biweekly">Every other week</option>
              <option value="monthly">Certain weeks of the month</option>
              <option value="dates">Specific dates only</option>
            </select></label>
          {edit.repeat === 'biweekly' && (
            <label className="block"><span className={lab}>A date it airs (we count every other week from here)</span>
              <input type="date" className={box} value={edit.anchor} onChange={e => setEdit({ ...edit, anchor: e.target.value })} required /></label>
          )}
          {edit.repeat === 'monthly' && (
            <div className="flex flex-wrap gap-3 text-sm text-br-dk-text">
              {[[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [5, 'Last']].map(([n, l]) => (
                <label key={n} className="flex items-center gap-2">
                  <input type="checkbox" checked={edit.weeks.includes(n as number)}
                         onChange={e => setEdit({ ...edit, weeks: e.target.checked ? [...edit.weeks, n as number] : edit.weeks.filter(x => x !== n) })} />
                  {l}
                </label>
              ))}
            </div>
          )}
          {edit.repeat === 'dates' && (
            <label className="block"><span className={lab}>Dates (one per line, yyyy-mm-dd)</span>
              <textarea className={box} rows={3} value={edit.dates.join('\n')}
                        onChange={e => setEdit({ ...edit, dates: e.target.value.split(/[\s,]+/).map(x => x.trim()).filter(Boolean) })} /></label>
          )}
          <div className="grid sm:grid-cols-3 gap-4">
            {edit.repeat !== 'dates' ? <label><span className={lab}>Day</span>
              <select className={box} value={edit.dayOfWeek} onChange={e => setEdit({ ...edit, dayOfWeek: Number(e.target.value) })}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select></label> : <div />}
            <label><span className={lab}>Starts</span>
              <input type="time" className={box} value={edit.startTime} onChange={e => setEdit({ ...edit, startTime: e.target.value })} required /></label>
            <label><span className={lab}>Ends</span>
              <input type="time" className={box} value={edit.endTime} onChange={e => setEdit({ ...edit, endTime: e.target.value })} required /></label>
          </div>
          {edit.endTime && edit.endTime <= edit.startTime && <p className="text-xs text-br-dk-sub -mt-2">Ends the next day, after midnight.</p>}
          <Field label="Hosts (comma separated)" value={edit.hostNames.join(', ')}
                 onChange={e => setEdit({ ...edit, hostNames: e.target.value.split(',').map(x => x.trimStart()) })} />
          <Field label="Host accounts (usernames, comma separated)" value={edit.hostUsernames.join(', ')} placeholder="jsmith1, adoe2"
                 onChange={e => setEdit({ ...edit, hostUsernames: e.target.value.split(',').map(x => x.trimStart()) })} />
          <p className="text-xs text-br-dk-sub -mt-2">These people get the host panel (radio controls and set list) from 4 hours before this show until 4 hours after, and can request changes to it any time.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <label><span className={lab}>Category</span>
              <select className={box} value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c ? c[0].toUpperCase() + c.slice(1) : 'None'}</option>)}
              </select></label>
            <Field label="Show page (optional)" value={edit.showSlug} placeholder="slug from /shows/…"
                   onChange={e => setEdit({ ...edit, showSlug: e.target.value })} />
          </div>
          <label className="block"><span className={lab}>Description</span>
            <textarea className={box} rows={3} maxLength={600} value={edit.description}
                      onChange={e => setEdit({ ...edit, description: e.target.value })} /></label>
          <ColorPicker value={edit.color} onChange={color => setEdit({ ...edit, color })} />
          <ImagePicker scope="show" value={edit.imageUrl ? { url: edit.imageUrl, path: edit.imagePath } : null}
                       onChange={v => setEdit({ ...edit, imageUrl: v?.url ?? '', imagePath: v?.path ?? '' })} />
          <label className="flex items-center gap-3 text-sm text-br-dk-text">
            <input type="checkbox" checked={edit.isActive} onChange={e => setEdit({ ...edit, isActive: e.target.checked })} />
            On the schedule
          </label>
          <div className="grid grid-cols-2 gap-3">
            <PrimaryButton type="submit" busy={busy}>Save show</PrimaryButton>
            <button type="button" onClick={() => setEdit(null)}
                    className="sk-key rounded-xl py-3.5 text-sm font-display tracking-[0.2em] text-br-dk-text">Cancel</button>
          </div>
        </form>
      )}

      {[...DAYS, 'Specific dates'].map((d, i) => {
        const list = shows.filter(s => i === 7 ? s.repeat === 'dates' : s.repeat !== 'dates' && s.dayOfWeek === i)
        if (!list.length) return null
        return (
          <section key={d} className="space-y-2">
            <h2 className="font-display text-br-gold tracking-widest text-sm">{d}</h2>
            {list.map(s => (
              <div key={s.id} className={`sk-raised rounded-xl px-4 py-3 flex items-center gap-4 ${s.isActive ? '' : 'opacity-60'}`}>
                {s.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  : <div className="w-12 h-12 rounded-lg sk-field shrink-0" style={s.color ? { background: s.color } : undefined} />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-br-dk-text truncate">{s.showName}{s.isActive ? '' : ' (hidden)'}</p>
                  <p className="text-xs text-br-dk-sub truncate">{s.startTime} – {s.endTime}{s.endTime <= s.startTime ? ' (+1 day)' : ''}{s.repeat === 'biweekly' ? ' · every other week' : s.repeat === 'monthly' ? ` · ${s.weeks.map(w => w === 5 ? 'last' : ['', '1st', '2nd', '3rd', '4th'][w]).join(', ')} of the month` : s.repeat === 'dates' ? ` · ${s.dates.slice(0, 3).join(', ')}${s.dates.length > 3 ? '…' : ''}` : ''}{s.hostNames.length ? ` · ${s.hostNames.join(', ')}` : ''}</p>
                </div>
                <button onClick={() => { setEdit({ ...s }); setNotice('') }} className="text-xs text-br-gold">Edit</button>
                <button onClick={() => remove(s)} className="text-xs text-br-dk-sub hover:text-br-red">Delete</button>
              </div>
            ))}
          </section>
        )
      })}
      <div className="flex items-center gap-4 pt-4">
        <h2 className="font-display text-br-dk-text text-2xl tracking-[0.1em] shrink-0">One-time events</h2>
        <div className="flex-1 h-px bg-br-dk-border" />
        <button onClick={() => { setEditEv(blankEv()); setNotice('') }}
                className="sk-btn font-display tracking-widest text-xs px-4 py-2 rounded-lg shrink-0">Add event</button>
      </div>
      <p className="text-sm text-br-dk-sub">
        A special show or event on one date only. It appears on the schedule in the app and on the website, and past events drop off on their own.
      </p>

      {editEv && (
        <form onSubmit={saveEv} className="sk-raised rounded-2xl p-5 space-y-4">
          <Field label="Event name" value={editEv.title} onChange={e => setEditEv({ ...editEv, title: e.target.value })} maxLength={80} required />
          <div className="grid sm:grid-cols-3 gap-4">
            <label><span className={lab}>Date</span>
              <input type="date" className={box} value={editEv.date} onChange={e => setEditEv({ ...editEv, date: e.target.value })} required /></label>
            <label><span className={lab}>Starts</span>
              <input type="time" className={box} value={editEv.startTime} onChange={e => setEditEv({ ...editEv, startTime: e.target.value })} required /></label>
            <label><span className={lab}>Ends</span>
              <input type="time" className={box} value={editEv.endTime} onChange={e => setEditEv({ ...editEv, endTime: e.target.value })} required /></label>
          </div>
          {editEv.endTime && editEv.endTime <= editEv.startTime && <p className="text-xs text-br-dk-sub -mt-2">Ends the next day, after midnight.</p>}
          <Field label="Hosts (comma separated)" value={editEv.hostNames.join(', ')}
                 onChange={e => setEditEv({ ...editEv, hostNames: e.target.value.split(',').map(x => x.trimStart()) })} />
          <label><span className={lab}>Category</span>
            <select className={box} value={editEv.category} onChange={e => setEditEv({ ...editEv, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c ? c[0].toUpperCase() + c.slice(1) : 'None'}</option>)}
            </select></label>
          <label className="block"><span className={lab}>Description</span>
            <textarea className={box} rows={3} maxLength={600} value={editEv.description}
                      onChange={e => setEditEv({ ...editEv, description: e.target.value })} /></label>
          <p className="text-xs text-br-dk-sub -mb-2">Optional. While this event is on air, the player shows these instead of what the auto DJ is playing.</p>
          <Field label="Track title" value={editEv.trackTitle} onChange={e => setEditEv({ ...editEv, trackTitle: e.target.value })} maxLength={120} />
          <Field label="Artist" value={editEv.trackArtist} onChange={e => setEditEv({ ...editEv, trackArtist: e.target.value })} maxLength={120} />
          <Field label="Up next" value={editEv.nextTitle} onChange={e => setEditEv({ ...editEv, nextTitle: e.target.value })} maxLength={120} />
          <ColorPicker value={editEv.color} onChange={color => setEditEv({ ...editEv, color })} />
          <ImagePicker scope="show" value={editEv.imageUrl ? { url: editEv.imageUrl, path: editEv.imagePath } : null}
                       onChange={v => setEditEv({ ...editEv, imageUrl: v?.url ?? '', imagePath: v?.path ?? '' })} />
          <p className="text-xs text-br-dk-sub">Times are station time.</p>
          <div className="grid grid-cols-2 gap-3">
            <PrimaryButton type="submit" busy={busy}>Save event</PrimaryButton>
            <button type="button" onClick={() => setEditEv(null)}
                    className="sk-key rounded-xl py-3.5 text-sm font-display tracking-[0.2em] text-br-dk-text">Cancel</button>
          </div>
        </form>
      )}

      <section className="space-y-2">
        {events.map(ev => (
          <div key={ev.id} className="sk-raised rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg sk-field shrink-0 overflow-hidden" style={ev.color ? { background: ev.color } : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {ev.imageUrl && <img src={ev.imageUrl} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-br-dk-text truncate">{ev.title}</p>
              <p className="text-xs text-br-dk-sub truncate">{ev.date} · {ev.startTime} – {ev.endTime}{ev.endTime <= ev.startTime ? ' (+1 day)' : ''}{ev.hostNames.length ? ` · ${ev.hostNames.join(', ')}` : ''}</p>
            </div>
            <button onClick={() => { setEditEv({ ...ev }); setNotice('') }} className="text-xs text-br-gold">Edit</button>
            <button onClick={() => removeEv(ev)} className="text-xs text-br-dk-sub hover:text-br-red">Delete</button>
          </div>
        ))}
        {events.length === 0 && !editEv && <p className="text-sm text-br-dk-sub">No one-time events yet.</p>}
      </section>
      {shows.length === 0 && !edit && <p className="text-sm text-br-dk-sub">No weekly shows yet. Add the first one.</p>}
    </div>
  )
}
