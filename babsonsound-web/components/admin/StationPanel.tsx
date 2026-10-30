'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'

interface Show { occId: string; title: string; startAt: number; endAt: number; onAir: boolean; note: { headline: string; message: string } | null }
interface Data {
  configured: boolean
  nowPlaying: { song: string; listeners: number; isLive: boolean; streamer: string } | null
  shows: Show[]
  announcement: { text: string; until: number } | null
  audioFx?: boolean
  onAirSign?: boolean
  maintenance?: boolean
}

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

// The station controls: skip, a message for the whole audience, a message on one show, and the emergency stop.
export default function StationPanel({ only = 'controls' }: { only?: 'controls' | 'tests' }) {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [text, setText] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [pick, setPick] = useState('')
  const [headline, setHeadline] = useState('')
  const [message, setMessage] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ requestId: string; title: string; artist: string }[]>([])
  const [confirm, setConfirm] = useState<'emergency-stop' | 'resume' | null>(null)

  const load = useCallback(() => { apiGet<Data>('/api/admin/controls').then(setD).catch(e => setErr(e.message)) }, [])
  useEffect(() => { queueMicrotask(load); const t = setInterval(() => { if (!document.hidden) load() }, 30_000); return () => clearInterval(t) }, [load])

  async function run(key: string, body: Record<string, unknown>, ok: string) {
    setBusy(key); setErr(''); setMsg('')
    try { await api('/api/admin/controls', body); setMsg(ok); load() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed.') }
    setBusy(''); setConfirm(null)
  }
  async function search() {
    setBusy('search'); setErr(''); setMsg('')
    try { const r = await apiGet<{ songs: typeof found }>(`/api/admin/play-next?q=${encodeURIComponent(q)}`); setFound(r.songs); if (!r.songs.length) setMsg('No songs found. Only playlists that allow requests are searchable.') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Search failed.') }
    setBusy('')
  }
  async function playNext(s: { requestId: string; title: string; artist: string }) {
    setBusy('next'); setErr(''); setMsg('')
    try { await api('/api/admin/play-next', { requestId: s.requestId, label: `${s.artist} - ${s.title}` }); setMsg(`${s.title} will play next.`); setFound([]); setQ('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed.') }
    setBusy('')
  }
  async function pin(clear: boolean) {
    const occId = pick || d?.shows.find(s => s.onAir)?.occId || d?.shows[0]?.occId
    if (!occId) return
    setBusy('note'); setErr(''); setMsg('')
    try {
      await api('/api/live/note', { occId, headline: clear ? '' : headline, message: clear ? '' : message })
      setMsg(clear ? 'Show message cleared.' : 'Show message is live.'); if (clear) { setHeadline(''); setMessage('') }; load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed.') }
    setBusy('')
  }

  if (!d) return <p className="text-base">{err || 'Loading controls…'}</p>
  const field = 'ops-field w-full'
  const btn = 'ops-btn px-4 py-2 disabled:opacity-50'
  const card = 'ops-card p-5 space-y-3 min-w-0'
  const h = 'text-xl font-light'

  return (
    <div className="space-y-4">
      {!d.configured && <p className="text-base">Radio not connected. Messages still work.</p>}
      {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-2">{err}</p>}
      {msg && <p role="status" className="text-base font-semibold">{msg}</p>}

      <div className="grid md:grid-cols-2 gap-5">
        {only === 'controls' && (<>
        <section className={card}>
          <h3 className={h}>Playback</h3>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" disabled={!!busy} onClick={() => run('skip', { action: 'skip' }, 'Skipped.')} className={btn}>Skip song</button>
            {confirm ? (
              <>
                <span className="text-base">{confirm === 'emergency-stop' ? 'Take the station off air?' : 'Bring the station back?'}</span>
                <button type="button" disabled={!!busy} onClick={() => run(confirm, { action: confirm }, confirm === 'resume' ? 'Back on air.' : 'Station stopped.')} className={`ops-btn-red px-4 py-2 ${'disabled:opacity-50'}`}>Yes</button>
                <button type="button" onClick={() => setConfirm(null)} className={btn}>Cancel</button>
              </>
            ) : (
              <>
                <button type="button" disabled={!!busy} onClick={() => setConfirm('emergency-stop')} className="ops-btn-red px-4 py-2 disabled:opacity-50">Emergency stop</button>
                <button type="button" disabled={!!busy} onClick={() => setConfirm('resume')} className={btn}>Resume</button>
              </>
            )}
          </div>
        </section>

        <section className={card}>
          <h3 className={h}>Maintenance mode</h3>
          <p className="text-base opacity-90">While on, what is playing says &quot;Babson Radio will be back shortly&quot; on the site and in the app. It does not stop the audio. Use Emergency stop for that.</p>
          <button type="button" disabled={!!busy} aria-pressed={d.maintenance === true}
                  onClick={() => run('maintenance', { action: 'maintenance', on: d.maintenance !== true }, d.maintenance === true ? 'Maintenance mode is off.' : 'Maintenance mode is on.')} className={btn}>
            {d.maintenance === true ? 'On: turn off' : 'Off: turn on'}
          </button>
        </section>

        <section className={card}>
          <h3 className={h}>Play a song next</h3>
          <form onSubmit={e => { e.preventDefault(); if (q.trim().length > 1) search() }} className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} maxLength={80} placeholder="Song or artist" aria-label="Song or artist" className={field} />
            <button type="submit" disabled={!!busy || q.trim().length < 2} className={btn}>Search</button>
          </form>
          {found.length > 0 && (
            <ul className="space-y-2">
              {found.map(s => (
                <li key={s.requestId} className="flex items-center justify-between gap-2 text-base">
                  <span className="truncate">{s.title}<span className="opacity-80"> · {s.artist}</span></span>
                  <button type="button" disabled={!!busy} onClick={() => playNext(s)} className={`shrink-0 ${btn}`}>Play next</button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-base opacity-90">Plays before votes and the schedule. Not for live shows.</p>
        </section>

        <section className={card}>
          <h3 className={h}>Message to everyone</h3>
          {d.announcement && <p className="text-base font-semibold">Live now: {d.announcement.text} <span className="font-normal opacity-80">(until {when(d.announcement.until)})</span></p>}
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={240} aria-label="Message to everyone"
                    placeholder="Shows on every page and in the app" className={field} />
          <div className="flex flex-wrap gap-2 items-center">
            <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="ops-field" aria-label="How long to show it">
              {[[15, '15 minutes'], [60, '1 hour'], [180, '3 hours'], [720, '12 hours']].map(([m, l]) => <option key={m} value={m}>{l}</option>)}
            </select>
            <button type="button" disabled={!!busy || !text.trim()} onClick={() => run('announce', { action: 'announce', text, minutes }, 'Sent to everyone.')} className={btn}>Send</button>
            {d.announcement && <button type="button" disabled={!!busy} onClick={() => run('clear', { action: 'clear-announcement' }, 'Message removed.')} className={btn}>Remove</button>}
          </div>
        </section>

        <section className={card}>
          <h3 className={h}>Message on one show</h3>
          <select value={pick} onChange={e => { setPick(e.target.value); const s = d.shows.find(x => x.occId === e.target.value); setHeadline(s?.note?.headline ?? ''); setMessage(s?.note?.message ?? '') }} className={field} aria-label="Show">
            <option value="">{d.shows.find(s => s.onAir) ? 'On air now' : 'Choose a show'}</option>
            {d.shows.map(s => <option key={s.occId} value={s.occId}>{s.title} · {when(s.startAt)}{s.note ? ' · has message' : ''}</option>)}
          </select>
          <input value={headline} onChange={e => setHeadline(e.target.value)} maxLength={80} placeholder="Headline" aria-label="Headline" className={field} />
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} maxLength={400} placeholder="Details" aria-label="Details" className={field} />
          <div className="flex gap-2 items-center">
            <button type="button" disabled={!!busy} onClick={() => pin(false)} className={btn}>Pin</button>
            <button type="button" disabled={!!busy} onClick={() => pin(true)} className={btn}>Clear</button>
          </div>
        </section>
        </>)}
        {only === 'tests' && (<>
        <section className={card}>
          <h3 className={h}>ON AIR sign</h3>
          <p className="text-base opacity-90">Automatic during live shows. Switch on by hand for other events.</p>
          <button type="button" disabled={!!busy} aria-pressed={d.onAirSign === true}
                  onClick={() => run('sign', { action: 'on-air-sign', on: d.onAirSign !== true }, d.onAirSign === true ? 'ON AIR sign is off.' : 'ON AIR sign is on.')} className={btn}>
            {d.onAirSign === true ? 'On: turn off' : 'Off: turn on'}
          </button>
        </section>

        <section className={card}>
          <h3 className={h}>Audio processing</h3>
          <p className="text-base opacity-90">Website equalizer and volume boost. Off plays the raw stream.</p>
          <button type="button" disabled={!!busy} aria-pressed={d.audioFx !== false}
                  onClick={() => run('fx', { action: 'audio-fx', on: d.audioFx === false }, d.audioFx === false ? 'Audio processing is on.' : 'Audio processing is off.')} className={btn}>
            {d.audioFx === false ? 'Off: turn on' : 'On: turn off'}
          </button>
        </section>

        </>)}
      </div>
    </div>
  )
}
