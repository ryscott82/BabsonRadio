'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import ImagePicker from '@/components/ImagePicker'

interface Show {
  id: string; showName: string; dayOfWeek: number; startTime: string; endTime: string; description: string
  hostNames: string[]; category: string; imageUrl: string; imagePath: string; showSlug: string; isActive: boolean
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const CATEGORIES = ['', 'music', 'talk', 'interview', 'news', 'podcast', 'other']
const blank = (): Show => ({ id: '', showName: '', dayOfWeek: 1, startTime: '20:00', endTime: '21:00', description: '',
  hostNames: [], category: '', imageUrl: '', imagePath: '', showSlug: '', isActive: true })

export default function AdminSchedulePage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [shows, setShows] = useState<Show[]>([])
  const [edit, setEdit] = useState<Show | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setShows((await apiGet<{ shows: Show[] }>('/api/admin/schedule')).shows) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the schedule.') }
  }, [])

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  if (!user || !isAdmin) return null

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
  async function remove(s: Show) {
    if (!confirm(`Delete "${s.showName}" from the weekly schedule?`)) return
    setError('')
    try { await api('/api/admin/schedule', { action: 'delete', id: s.id }); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete.') }
  }

  const box = 'sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none'
  const lab = 'block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">WEEKLY SCHEDULE</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <button onClick={() => { setEdit(blank()); setNotice('') }}
                className="sk-btn font-display tracking-widest text-xs px-4 py-2 rounded-lg shrink-0">ADD SHOW</button>
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
          <div className="grid sm:grid-cols-3 gap-4">
            <label><span className={lab}>DAY</span>
              <select className={box} value={edit.dayOfWeek} onChange={e => setEdit({ ...edit, dayOfWeek: Number(e.target.value) })}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select></label>
            <label><span className={lab}>STARTS</span>
              <input type="time" className={box} value={edit.startTime} onChange={e => setEdit({ ...edit, startTime: e.target.value })} required /></label>
            <label><span className={lab}>ENDS</span>
              <input type="time" className={box} value={edit.endTime} onChange={e => setEdit({ ...edit, endTime: e.target.value })} required /></label>
          </div>
          <Field label="Hosts (comma separated)" value={edit.hostNames.join(', ')}
                 onChange={e => setEdit({ ...edit, hostNames: e.target.value.split(',').map(x => x.trimStart()) })} />
          <div className="grid sm:grid-cols-2 gap-4">
            <label><span className={lab}>CATEGORY</span>
              <select className={box} value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c ? c[0].toUpperCase() + c.slice(1) : 'None'}</option>)}
              </select></label>
            <Field label="Show page (optional)" value={edit.showSlug} placeholder="slug from /shows/…"
                   onChange={e => setEdit({ ...edit, showSlug: e.target.value })} />
          </div>
          <label className="block"><span className={lab}>DESCRIPTION</span>
            <textarea className={box} rows={3} maxLength={600} value={edit.description}
                      onChange={e => setEdit({ ...edit, description: e.target.value })} /></label>
          <ImagePicker scope="show" value={edit.imageUrl ? { url: edit.imageUrl, path: edit.imagePath } : null}
                       onChange={v => setEdit({ ...edit, imageUrl: v?.url ?? '', imagePath: v?.path ?? '' })} />
          <label className="flex items-center gap-3 text-sm text-br-dk-text">
            <input type="checkbox" checked={edit.isActive} onChange={e => setEdit({ ...edit, isActive: e.target.checked })} />
            On the schedule
          </label>
          <div className="grid grid-cols-2 gap-3">
            <PrimaryButton type="submit" busy={busy}>SAVE SHOW</PrimaryButton>
            <button type="button" onClick={() => setEdit(null)}
                    className="sk-key rounded-xl py-3.5 text-sm font-display tracking-[0.2em] text-br-dk-text">CANCEL</button>
          </div>
        </form>
      )}

      {DAYS.map((d, i) => {
        const list = shows.filter(s => s.dayOfWeek === i)
        if (!list.length) return null
        return (
          <section key={d} className="space-y-2">
            <h2 className="font-display text-br-gold tracking-widest text-sm">{d.toUpperCase()}</h2>
            {list.map(s => (
              <div key={s.id} className={`sk-raised rounded-xl px-4 py-3 flex items-center gap-4 ${s.isActive ? '' : 'opacity-60'}`}>
                {s.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  : <div className="w-12 h-12 rounded-lg sk-field shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-br-dk-text truncate">{s.showName}{s.isActive ? '' : ' (hidden)'}</p>
                  <p className="text-xs text-br-dk-sub truncate">{s.startTime} – {s.endTime}{s.hostNames.length ? ` · ${s.hostNames.join(', ')}` : ''}</p>
                </div>
                <button onClick={() => { setEdit({ ...s }); setNotice('') }} className="text-xs text-br-gold">Edit</button>
                <button onClick={() => remove(s)} className="text-xs text-br-dk-sub hover:text-br-red">Delete</button>
              </div>
            ))}
          </section>
        )
      })}
      {shows.length === 0 && !edit && <p className="text-sm text-br-dk-sub">No weekly shows yet. Add the first one.</p>}
    </div>
  )
}
