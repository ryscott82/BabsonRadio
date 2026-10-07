'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import ImagePicker from '@/components/ImagePicker'

interface HShow { id: string; key: string; kind: 'weekly' | 'slot'; refId: string; title: string; startAt: number; endAt: number; open: boolean }
interface NowPlaying { song: string; elapsed: number; duration: number; isLive: boolean; streamer: string; listeners: number }
interface Status {
  staff: boolean; controlsOpen: boolean; windowHours: number; now: number
  shows: HShow[]; nowPlaying: NowPlaying | null; pending: { id: string; scheduleId: string }[]
}

const when = (ms: number) =>
  new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function HostPage() {
  const { user, isBabson, isDeveloper, loading } = useAuth()
  const router = useRouter()
  const [st, setSt] = useState<Status | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setSt(await apiGet<Status>('/api/host/status')); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the host panel.') }
  }, [])

  useEffect(() => { if (!loading && !user) router.replace('/auth') }, [loading, user, router])
  useEffect(() => {
    if (!user || !(isBabson || isDeveloper)) return
    queueMicrotask(load)
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [user, isBabson, isDeveloper, load])

  if (!user) return null
  if (!isBabson && !isDeveloper) return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-br-dk-sub">The host panel is for students. Verify your school email first.</p>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">HOST PANEL</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <ErrorText>{error}</ErrorText>
      {!st && !error && <p className="text-sm text-br-dk-sub">Loading…</p>}
      {st && !st.staff && st.shows.length === 0 && (
        <p className="text-sm text-br-dk-sub">
          You are not listed as a host on any show yet. Once a station admin adds you to a weekly show, or a show you requested is approved, it appears here.
        </p>
      )}
      {st && (st.staff || st.shows.length > 0) && (
        <>
          <Controls st={st} reload={load} />
          <SetList st={st} />
          <Shows st={st} />
          <ChangeRequest st={st} reload={load} />
        </>
      )}
    </div>
  )
}

function Controls({ st, reload }: { st: Status; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const next = st.shows.find(s => s.startAt - st.windowHours * 3_600_000 > st.now)
  const np = st.nowPlaying
  const pct = np && np.duration > 0 ? Math.min(100, (np.elapsed / np.duration) * 100) : 0

  async function skip() {
    setBusy(true); setErr(''); setMsg('')
    try { await api('/api/host/skip', {}); setMsg('Skipped. The next song is starting.'); setTimeout(reload, 2500) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not skip.') }
    setBusy(false)
  }

  return (
    <section className="sk-raised rounded-2xl p-5 space-y-4">
      <h2 className="font-display text-br-gold tracking-widest text-sm">ON AIR</h2>
      {st.controlsOpen ? (
        <>
          <div className="space-y-2">
            <p className="text-xs text-br-dk-sub">{np?.isLive ? `LIVE${np.streamer ? ` · ${np.streamer}` : ''}` : 'NOW PLAYING'}{np ? ` · ${np.listeners} listening` : ''}</p>
            <p className="text-lg text-br-dk-text">{np?.song || 'Nothing reported right now'}</p>
            {np && np.duration > 0 && <div className="h-1.5 rounded-full bg-br-dk-border overflow-hidden"><div className="h-full bg-br-gold" style={{ width: `${pct}%` }} /></div>}
          </div>
          <ErrorText>{err}</ErrorText>
          {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
          <PrimaryButton type="button" busy={busy} onClick={skip}>SKIP THIS SONG</PrimaryButton>
          <p className="text-xs text-br-dk-sub">Open from {st.windowHours} hours before your show until {st.windowHours} hours after. Every skip is logged.</p>
        </>
      ) : (
        <p className="text-sm text-br-dk-sub">
          {next
            ? `Controls open ${st.windowHours} hours before ${next.title}, which starts ${when(next.startAt)}.`
            : 'You have no upcoming shows this week.'}
        </p>
      )}
    </section>
  )
}

function SetList({ st }: { st: Status }) {
  const choices = st.shows.filter(s => s.open)
  const [pick, setPick] = useState('')
  const [songs, setSongs] = useState('')
  const [saved, setSaved] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const sel = choices.find(s => s.id === pick) ?? choices.find(s => s.startAt <= st.now && s.endAt >= st.now) ?? choices[0]
  const selId = sel?.id

  useEffect(() => {
    if (!sel) return
    let live = true
    apiGet<{ songs: string; updatedAt: number | null }>(`/api/host/setlist?key=${encodeURIComponent(sel.key)}&startAt=${sel.startAt}`)
      .then(r => { if (live) { setSongs(r.songs); setSaved(r.updatedAt) } })
      .catch(e => live && setErr(e instanceof Error ? e.message : 'Could not load your set list.'))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId])

  async function save() {
    if (!sel) return
    setBusy(true); setErr('')
    try { setSaved((await api<{ savedAt: number }>('/api/host/setlist', { key: sel.key, startAt: sel.startAt, songs })).savedAt) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  return (
    <section className="sk-raised rounded-2xl p-5 space-y-3">
      <h2 className="font-display text-br-gold tracking-widest text-sm">SET LIST</h2>
      {!sel ? (
        <p className="text-sm text-br-dk-sub">The set list opens {st.windowHours} hours before your show.</p>
      ) : (
        <>
          {choices.length > 1 && (
            <select value={sel.id} onChange={e => setPick(e.target.value)} className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full">
              {choices.map(s => <option key={s.id} value={s.id}>{s.title} · {when(s.startAt)}</option>)}
            </select>
          )}
          <p className="text-xs text-br-dk-sub">{sel.title} · {when(sel.startAt)} – {clock(sel.endAt)}</p>
          <textarea value={songs} onChange={e => setSongs(e.target.value)} rows={10} maxLength={10000}
                    placeholder={'One song per line, like:\nArtist – Song title\nArtist – Song title'}
                    className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" />
          <ErrorText>{err}</ErrorText>
          <div className="flex items-center gap-4">
            <PrimaryButton type="button" busy={busy} onClick={save}>SAVE SET LIST</PrimaryButton>
            {saved && <span role="status" className="text-xs text-br-dk-sub">Saved {clock(saved)}</span>}
          </div>
          <p className="text-xs text-br-dk-sub">Type it as you go or paste the whole list at the end. You can edit it until {st.windowHours} hours after your show.</p>
        </>
      )}
    </section>
  )
}

function Shows({ st }: { st: Status }) {
  if (!st.shows.length) return null
  return (
    <section className="space-y-3">
      <h2 className="font-display text-br-gold tracking-widest text-sm">YOUR SHOWS</h2>
      {st.shows.map(s => (
        <div key={s.id} className="sk-field rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-br-dk-text truncate">{s.title}</p>
            <p className="text-xs text-br-dk-sub">{when(s.startAt)} – {clock(s.endAt)}</p>
          </div>
          <span className={`text-[10px] font-display tracking-widest shrink-0 ${s.open ? 'text-br-gold' : 'text-br-dk-sub'}`}>{s.open ? 'PANEL OPEN' : 'UPCOMING'}</span>
        </div>
      ))}
    </section>
  )
}

function ChangeRequest({ st, reload }: { st: Status; reload: () => void }) {
  const weekly = [...new Map(st.shows.filter(s => s.kind === 'weekly').map(s => [s.refId, s])).values()]
  const [scheduleId, setScheduleId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<{ url: string; path: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  if (!weekly.length) return null
  const sid = scheduleId || weekly[0].refId

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setOk('')
    try {
      await api('/api/host/update-request', { scheduleId: sid, showName: name, description, imageUrl: image?.url ?? '', imagePath: image?.path ?? '' })
      setName(''); setDescription(''); setImage(null); setOk('Sent. Staff will review it and the change goes live when approved.'); reload()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not send.') }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="sk-raised rounded-2xl p-5 space-y-4">
      <h2 className="font-display text-br-gold tracking-widest text-sm">REQUEST A CHANGE TO YOUR SHOW</h2>
      {weekly.length > 1 && (
        <select value={sid} onChange={e => setScheduleId(e.target.value)} className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full">
          {weekly.map(s => <option key={s.refId} value={s.refId}>{s.title}</option>)}
        </select>
      )}
      <Field label="New name (optional)" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
      <label className="block">
        <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">NEW DESCRIPTION (OPTIONAL)</span>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={600}
                  className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" />
      </label>
      <ImagePicker scope="slot" value={image} onChange={setImage} />
      <ErrorText>{err}</ErrorText>
      {ok && <p role="status" className="text-sm text-br-gold">{ok}</p>}
      {st.pending.length > 0 && <p className="text-xs text-br-dk-sub">{st.pending.length} request{st.pending.length > 1 ? 's' : ''} waiting for review.</p>}
      <PrimaryButton type="submit" busy={busy}>SEND REQUEST</PrimaryButton>
    </form>
  )
}
