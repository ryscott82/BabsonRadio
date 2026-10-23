'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import ImagePicker from '@/components/ImagePicker'
import MyRecordings from '@/components/MyRecordings'

interface HShow { id: string; key: string; kind: 'weekly' | 'slot'; refId: string; title: string; startAt: number; endAt: number; open: boolean }
interface NowPlaying { song: string; elapsed: number; duration: number; isLive: boolean; streamer: string; listeners: number }
interface Insight {
  comments?: { stars: number; text: string; at: number }[]
  requestsOpen?: boolean; colorChanging?: boolean; requests?: { id: string; text: string; name: string; at: number }[]
  note: { headline: string; message: string } | null
  reactions: Record<string, number>; recentReactions: Record<string, number>
  ratingCount: number; ratingAvg: number
  songs: { id: string; text: string; votes: number }[]
}
interface Status {
  staff: boolean; canEditAny: boolean; insights: Record<string, Insight>; controlsOpen: boolean; windowHours: number; now: number
  birthdays?: string[]
  shows: HShow[]; nowPlaying: NowPlaying | null; pending: { id: string; scheduleId: string }[]
}

const when = (ms: number) =>
  new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function HostPage() {
  const { user, isBabson, loading } = useAuth()
  const router = useRouter()
  const [st, setSt] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'live' | 'stats' | 'setlist' | 'shows'>('live')

  const load = useCallback(async () => {
    try { setSt(await apiGet<Status>('/api/host/status')); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the host panel.') }
  }, [])

  useEffect(() => { if (!loading && !user) router.replace('/auth') }, [loading, user, router])
  useEffect(() => {
    if (!user || !isBabson) return
    queueMicrotask(load)
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [user, isBabson, load])

  if (!user) return null
  if (!isBabson) return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-br-dk-sub">The host panel is for students.</p>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Host</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <ErrorText>{error}</ErrorText>
      {!st && !error && <p className="text-sm text-br-dk-sub">Loading…</p>}
      {st && !st.staff && st.shows.length === 0 && (
        <p className="text-sm text-br-dk-sub">
          You aren&apos;t hosting a show yet.
        </p>
      )}
      {st && (st.staff || st.shows.length > 0) && (
        <>
          <div className="flex gap-1 border-b border-br-dk-border" role="tablist">
            {([['live', 'Live'], ['stats', 'Stats'], ['setlist', 'Set list'], ['shows', 'My shows']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={`font-display tracking-widest text-sm px-4 py-2 -mb-px border-b-2 ${tab === k ? 'border-br-gold text-br-gold' : 'border-transparent text-br-dk-sub hover:text-br-dk-text'}`}>{l}</button>
            ))}
          </div>
          {tab === 'live' && (<><Controls st={st} /><LiveNote st={st} reload={load} /><SongRequests st={st} reload={load} /><Insights st={st} /></>)}
          {tab === 'stats' && <Stats />}
          {tab === 'setlist' && <SetList st={st} />}
          {tab === 'shows' && (<><Shows st={st} /><MyRecordings /><ChangeRequest st={st} reload={load} /></>)}
        </>
      )}
    </div>
  )
}

function useClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return now
}
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

// A read-only feed for the host: what is playing, how long until they start or must finish, and nothing to press.
function Controls({ st }: { st: Status }) {
  const now = useClock()
  const np = st.nowPlaying
  const pct = np && np.duration > 0 ? Math.min(100, (np.elapsed / np.duration) * 100) : 0
  const upcoming = st.shows.find(s => s.endAt > now)
  const next = st.shows.find(s => s.startAt - st.windowHours * 3_600_000 > st.now)
  const onNow = upcoming && upcoming.startAt <= now
  const soon = upcoming && upcoming.open && !onNow
  const remaining = upcoming ? (onNow ? upcoming.endAt - now : upcoming.startAt - now) : 0
  const urgent = onNow ? remaining < 5 * 60_000 : remaining < 10 * 60_000

  return (
    <section className="sk-raised rounded-2xl p-5 space-y-4">
      <h2 className="font-display text-br-gold tracking-widest text-sm">On air</h2>
      {st.controlsOpen ? (
        <>
          {upcoming && (onNow || soon) && (
            <div className="text-center py-2" role="timer" aria-live="off">
              <p className="text-xs text-br-dk-sub">{upcoming.title} · {onNow ? 'time left' : 'starts in'}</p>
              <p className={`font-display text-6xl tabular-nums tracking-wider ${urgent ? 'text-br-red' : 'text-br-dk-text'}`}>{mmss(remaining)}</p>
              <p className="text-xs text-br-dk-sub mt-1">
                {onNow ? (remaining < 5 * 60_000 ? 'Time to wrap up.' : `Ends at ${clock(upcoming.endAt)}`) : `On at ${clock(upcoming.startAt)}`}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs text-br-dk-sub">{np?.isLive ? `LIVE${np.streamer ? ` · ${np.streamer}` : ''}` : 'NOW PLAYING'}{np ? ` · ${np.listeners} listening` : ''}</p>
            <p className="text-lg text-br-dk-text">{np?.song || 'Nothing reported right now'}</p>
            {np && np.duration > 0 && <div className="h-1.5 rounded-full bg-br-dk-border overflow-hidden"><div className="h-full bg-br-gold" style={{ width: `${pct}%` }} /></div>}
          </div>
          <p className="text-xs text-br-dk-sub">Open from {st.windowHours} hours before your show until {st.windowHours} hours after. Station controls are with the admins.</p>
        </>
      ) : (
        <p className="text-sm text-br-dk-sub">
          {next
            ? `Opens ${st.windowHours} hours before ${next.title}, which starts ${when(next.startAt)}.`
            : 'You have no upcoming shows this week.'}
        </p>
      )}
    </section>
  )
}

// Pin a message for listeners while the show airs ("Taking requests until 9", "Guest: …", "We're running late").
function LiveNote({ st, reload }: { st: Status; reload: () => void }) {
  const choices = st.shows.filter(s => s.open)
  const [pick, setPick] = useState('')
  const sel = choices.find(s => s.id === pick) ?? choices.find(s => s.startAt <= st.now && s.endAt >= st.now) ?? choices[0]
  const existing = sel ? st.insights[sel.id]?.note : null
  const [headline, setHeadline] = useState('')
  const [message, setMessage] = useState('')
  const [loadedFor, setLoadedFor] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const selId = sel?.id ?? ''
  if (selId && loadedFor !== selId) { setLoadedFor(selId); setHeadline(existing?.headline ?? ''); setMessage(existing?.message ?? '') }
  if (!sel) return null
  const colorOn = st.insights[sel.id]?.colorChanging === true

  async function toggleColor(on: boolean) {
    setBusy(true); setErr('')
    try { await api('/api/live/color', { occId: sel!.id, on }); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  async function save(clear = false) {
    setBusy(true); setErr(''); setMsg('')
    try {
      await api('/api/live/note', { occId: sel!.id, headline: clear ? '' : headline, message: clear ? '' : message })
      if (clear) { setHeadline(''); setMessage('') }
      setMsg(clear ? 'Cleared.' : 'Live. Listeners see it within a few seconds.'); reload()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  return (
    <section className="sk-raised rounded-2xl p-5 space-y-3">
      <h2 className="font-display text-br-gold tracking-widest text-sm">Message to listeners</h2>
      {choices.length > 1 && (
        <select value={sel.id} onChange={e => setPick(e.target.value)} className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full">
          {choices.map(s => <option key={s.id} value={s.id}>{s.title} · {when(s.startAt)}</option>)}
        </select>
      )}
      <Field label="Headline" value={headline} onChange={e => setHeadline(e.target.value)} maxLength={80} placeholder="Guest in studio: Prof. Lee" />
      <label className="block">
        <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">Details</span>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={400}
                  className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" />
      </label>
      <ErrorText>{err}</ErrorText>
      {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
      <div className="flex gap-3 items-center">
        <PrimaryButton type="button" busy={busy} onClick={() => save(false)}>Show to listeners</PrimaryButton>
        <button type="button" onClick={() => save(true)} className="text-sm text-br-dk-sub">Clear</button>
      </div>
      <label className="flex items-center gap-3 text-sm text-br-dk-text pt-2 border-t border-br-dk-border">
        <input type="checkbox" checked={colorOn} disabled={busy} onChange={e => toggleColor(e.target.checked)} />
        Color-changing background for this set (night only, 7pm to 6am)
      </label>
    </section>
  )
}

// Let listeners type song or artist requests during this show. Off by default; never available for the auto DJ.
function SongRequests({ st, reload }: { st: Status; reload: () => void }) {
  const choices = st.shows.filter(s => s.open && st.insights[s.id])
  const sel = choices.find(s => s.startAt <= st.now && s.endAt >= st.now) ?? choices[0]
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!sel) return null
  const i = st.insights[sel.id]
  const open = i.requestsOpen === true
  async function toggle() {
    setBusy(true); setErr('')
    try { await api('/api/live/requests', { occId: sel!.id, open: !open }); reload() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }
  return (
    <section className="sk-raised rounded-2xl p-5 space-y-3">
      <h2 className="font-display text-br-gold tracking-widest text-sm">SONG REQUESTS · {sel.title.toUpperCase()}</h2>
      <p className="text-xs text-br-dk-sub">Let listeners type in a song or artist.</p>
      <ErrorText>{err}</ErrorText>
      <PrimaryButton type="button" busy={busy} onClick={toggle}>{open ? 'STOP TAKING REQUESTS' : 'TAKE REQUESTS'}</PrimaryButton>
      {open && (i.requests?.length
        ? <ul className="text-sm text-br-dk-text divide-y divide-br-dk-border">{i.requests.map(r => <li key={r.id} className="py-1.5">{r.text} <span className="text-xs text-br-dk-sub">· {r.name}</span></li>)}</ul>
        : <p className="text-xs text-br-dk-sub">No requests yet.</p>)}
    </section>
  )
}

// What listeners are doing, so the host can respond: reactions, ratings and the most upvoted songs.
function Insights({ st }: { st: Status }) {
  const open = st.shows.filter(s => s.open && st.insights[s.id])
  if (!open.length) return null
  const sel = open.find(s => s.startAt <= st.now && s.endAt >= st.now) ?? open[0]
  const i = st.insights[sel.id]
  const top = i.songs.filter(x => x.votes > 0).slice(0, 5)
  return (
    <section className="sk-raised rounded-2xl p-5 space-y-3">
      <h2 className="font-display text-br-gold tracking-widest text-sm">LISTENERS · {sel.title.toUpperCase()}</h2>
      <div className="flex flex-wrap gap-4 text-sm text-br-dk-text">
        {Object.entries(i.reactions).map(([e, n]) => (
          <span key={e}>{e} <span className="tabular-nums">{n}</span>{i.recentReactions[e] ? <span className="text-br-gold"> +{i.recentReactions[e]}</span> : null}</span>
        ))}
      </div>
      <p className="text-sm text-br-dk-sub">
        {i.ratingCount ? <>Rating: <span className="text-br-dk-text">{i.ratingAvg} ★</span> from {i.ratingCount} listener{i.ratingCount === 1 ? '' : 's'}</> : 'No ratings yet.'}
      </p>
      {top.length > 0 && (
        <ul className="text-sm space-y-0.5">
          {top.map(x => <li key={x.id} className="text-br-dk-text">▲ {x.votes} · {x.text}</li>)}
        </ul>
      )}
      {!!i.comments?.length && (
        <div className="space-y-1">
          <p className="text-xs text-br-dk-sub font-display tracking-widest">Feedback</p>
          <ul className="text-sm space-y-1">
            {i.comments.map((c, n) => <li key={n} className="text-br-dk-text">{c.stars} ★ · {c.text}</li>)}
          </ul>
        </div>
      )}
      {!!st.birthdays?.length && (
        <p className="text-sm text-br-dk-text">🎂 Birthdays today: <span className="text-br-gold">{st.birthdays.join(', ')}</span></p>
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
      <h2 className="font-display text-br-gold tracking-widest text-sm">Set list</h2>
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
            <PrimaryButton type="button" busy={busy} onClick={save}>Save set list</PrimaryButton>
            {saved && <span role="status" className="text-xs text-br-dk-sub">Saved {clock(saved)}</span>}
          </div>
          <p className="text-xs text-br-dk-sub">Type as you go or paste the list at the end.</p>
        </>
      )}
    </section>
  )
}

function Shows({ st }: { st: Status }) {
  if (!st.shows.length) return null
  return (
    <section className="space-y-3">
      <h2 className="font-display text-br-gold tracking-widest text-sm">Your shows</h2>
      {st.shows.map(s => (
        <div key={s.id} className="sk-field rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-br-dk-text truncate">{s.title}</p>
            <p className="text-xs text-br-dk-sub">{when(s.startAt)} – {clock(s.endAt)}</p>
          </div>
          <span className={`text-[13px] font-display tracking-widest shrink-0 ${s.open ? 'text-br-gold' : 'text-br-dk-sub'}`}>{s.open ? 'Panel open' : 'Upcoming'}</span>
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
      <h2 className="font-display text-br-gold tracking-widest text-sm">Request a change to your show</h2>
      {weekly.length > 1 && (
        <select value={sid} onChange={e => setScheduleId(e.target.value)} className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full">
          {weekly.map(s => <option key={s.refId} value={s.refId}>{s.title}</option>)}
        </select>
      )}
      <Field label="New name (optional)" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
      <label className="block">
        <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">New description (optional)</span>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={600}
                  className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" />
      </label>
      <ImagePicker scope="slot" value={image} onChange={setImage} />
      <ErrorText>{err}</ErrorText>
      {ok && <p role="status" className="text-sm text-br-gold">{ok}</p>}
      {st.pending.length > 0 && <p className="text-xs text-br-dk-sub">{st.pending.length} request{st.pending.length > 1 ? 's' : ''} waiting for review.</p>}
      <PrimaryButton type="submit" busy={busy}>Send request</PrimaryButton>
    </form>
  )
}

interface StatsData {
  shows: { key: string; title: string }[]; showKey?: string
  stats: null | {
    title: string; ratingAvg: number; ratingCount: number; stationAvg: number; rank: number | null; rankOf: number
    reactions: Record<string, number>; avgListeners: number; peakListeners: number
    airings: { occId: string; startAt: number; avgListeners: number; peakListeners: number; tunedIn: number; reactions: number; ratingAvg: number; ratingCount: number }[]
    bestSongs: { title: string; artist: string; avg: number; count: number }[]
    lowSongs: { title: string; artist: string; avg: number; count: number }[]
  }
}

// How the show is doing over time: listeners, reactions, ratings, songs and where it ranks.
function Stats() {
  const [key, setKey] = useState('')
  const [d, setD] = useState<StatsData | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    apiGet<StatsData>(`/api/host/stats${key ? `?showKey=${encodeURIComponent(key)}` : ''}`)
      .then(r => { if (live) setD(r) }).catch(e => live && setErr(e instanceof Error ? e.message : 'Could not load your stats.'))
    return () => { live = false }
  }, [key])
  if (err) return <ErrorText>{err}</ErrorText>
  if (!d) return <p className="text-sm text-br-dk-sub">Loading…</p>
  const s = d.stats
  if (!s) return <p className="text-sm text-br-dk-sub">Stats appear after your first show airs.</p>
  const tile = 'sk-raised rounded-xl p-4 text-center'
  const empty = !s.airings.length
  return (
    <div className="space-y-5">
      {d.shows.length > 1 && (
        <select value={d.showKey} onChange={e => setKey(e.target.value)} className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full" aria-label="Show">
          {d.shows.map(x => <option key={x.key} value={x.key}>{x.title}</option>)}
        </select>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={tile}><p className="font-display text-3xl text-br-dk-text tabular-nums">{s.ratingCount ? `${s.ratingAvg} ★` : '–'}</p><p className="text-xs text-br-dk-sub">{s.ratingCount} rating{s.ratingCount === 1 ? '' : 's'}</p></div>
        <div className={tile}><p className="font-display text-3xl text-br-dk-text tabular-nums">{s.rank ? `#${s.rank}` : '–'}</p><p className="text-xs text-br-dk-sub">{s.rank ? `of ${s.rankOf} shows` : 'needs ratings'}</p></div>
        <div className={tile}><p className="font-display text-3xl text-br-dk-text tabular-nums">{s.avgListeners || '–'}</p><p className="text-xs text-br-dk-sub">avg listeners</p></div>
        <div className={tile}><p className="font-display text-3xl text-br-dk-text tabular-nums">{s.peakListeners || '–'}</p><p className="text-xs text-br-dk-sub">peak listeners</p></div>
      </div>
      {s.ratingCount > 0 && <p className="text-xs text-br-dk-sub">Station average rating is {s.stationAvg} ★. Rank uses the last 60 days and gives little weight to shows with only a few ratings.</p>}
      <div className="sk-raised rounded-2xl p-4 flex flex-wrap gap-5 text-lg text-br-dk-text">
        {Object.entries(s.reactions).map(([e, n]) => <span key={e}>{e} <span className="tabular-nums text-base">{n}</span></span>)}
        <span className="text-xs text-br-dk-sub self-center">reactions, all time</span>
      </div>
      {empty ? <p className="text-sm text-br-dk-sub">Nothing recorded for this show yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-br-dk-text">
            <thead className="text-xs text-br-dk-sub text-left"><tr><th className="py-2 pr-3">Aired</th><th className="pr-3">Avg</th><th className="pr-3">Peak</th><th className="pr-3">Tuned in</th><th className="pr-3">Reactions</th><th>Rating</th></tr></thead>
            <tbody>
              {s.airings.map(a => (
                <tr key={a.occId} className="border-t border-br-dk-border tabular-nums">
                  <td className="py-1.5 pr-3">{new Date(a.startAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                  <td className="pr-3">{a.avgListeners || '–'}</td><td className="pr-3">{a.peakListeners || '–'}</td><td className="pr-3">{a.tunedIn}</td>
                  <td className="pr-3">{a.reactions}</td><td>{a.ratingCount ? `${a.ratingAvg} ★ (${a.ratingCount})` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.bestSongs.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="sk-raised rounded-2xl p-4"><p className="font-display text-br-gold tracking-widest text-xs mb-2">Top rated songs</p>
            <ul className="text-sm space-y-1">{s.bestSongs.map((x, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{x.artist ? `${x.artist} – ` : ''}{x.title}</span><span className="text-br-gold shrink-0">{x.avg} ★ ({x.count})</span></li>)}</ul></div>
          {s.lowSongs.length > 0 && <div className="sk-raised rounded-2xl p-4"><p className="font-display text-br-dk-sub tracking-widest text-xs mb-2">Lowest rated</p>
            <ul className="text-sm space-y-1">{s.lowSongs.map((x, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{x.artist ? `${x.artist} – ` : ''}{x.title}</span><span className="text-br-dk-sub shrink-0">{x.avg} ★ ({x.count})</span></li>)}</ul></div>}
        </div>
      )}
    </div>
  )
}
