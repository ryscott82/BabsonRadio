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
}

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const btn = 'rounded-lg px-4 py-2 text-xs font-display tracking-widest disabled:opacity-50'

// The station controls: skip, a message for the whole audience, a message on one show, and the emergency stop.
export default function StationPanel() {
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
  useEffect(() => { queueMicrotask(load); const t = setInterval(load, 15_000); return () => clearInterval(t) }, [load])

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

  if (!d) return <p className="text-sm text-br-dk-sub">{err || 'Loading controls…'}</p>
  const field = 'sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full'

  return (
    <div className="space-y-4">
      {!d.configured && <p className="text-xs text-br-dk-sub">Radio not connected: set AZURACAST_URL, AZURACAST_API_KEY and AZURACAST_STATION_ID in Vercel. Messages still work.</p>}
      {err && <p role="alert" className="text-sm text-br-red">{err}</p>}
      {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" disabled={!!busy} onClick={() => run('skip', { action: 'skip' }, 'Skipped.')} className={`sk-key text-br-dk-text ${btn}`}>Skip song</button>
        {confirm ? (
          <>
            <span className="text-sm text-br-dk-text">{confirm === 'emergency-stop' ? 'Take the station off air?' : 'Bring the station back?'}</span>
            <button type="button" disabled={!!busy} onClick={() => run(confirm, { action: confirm }, confirm === 'resume' ? 'Back on air.' : 'Station stopped.')}
                    className={`bg-br-red text-white ${btn}`}>Yes</button>
            <button type="button" onClick={() => setConfirm(null)} className={`text-br-dk-sub ${btn}`}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" disabled={!!busy} onClick={() => setConfirm('emergency-stop')} className={`bg-br-red text-white ${btn}`}>Emergency stop</button>
            <button type="button" disabled={!!busy} onClick={() => setConfirm('resume')} className={`border border-br-dk-border text-br-dk-text ${btn}`}>Resume</button>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-br-dk-sub font-display tracking-widest">play a song next</p>
        <form onSubmit={e => { e.preventDefault(); if (q.trim().length > 1) search() }} className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} maxLength={80} placeholder="Song or artist" aria-label="Song or artist" className={field} />
          <button type="submit" disabled={!!busy || q.trim().length < 2} className={`sk-btn ${btn}`}>Search</button>
        </form>
        {found.length > 0 && (
          <ul className="space-y-1">
            {found.map(s => (
              <li key={s.requestId} className="flex items-center justify-between gap-2 text-sm text-br-dk-text">
                <span className="truncate">{s.title}<span className="text-br-dk-sub"> · {s.artist}</span></span>
                <button type="button" disabled={!!busy} onClick={() => playNext(s)} className={`sk-btn shrink-0 ${btn}`}>Play next</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-br-dk-muted">Goes to the front of the line, ahead of votes and the schedule. Not for live shows.</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-br-dk-sub font-display tracking-widest">on air sign</p>
        <p className="text-sm text-br-dk-sub">The ON AIR sign shows by itself during live shows. Use this to turn it on by hand, for example for a live event the schedule does not know about. Remember to turn it off afterwards.</p>
        <button type="button" disabled={!!busy} aria-pressed={d.onAirSign === true}
                onClick={() => run('sign', { action: 'on-air-sign', on: d.onAirSign !== true }, d.onAirSign === true ? 'ON AIR sign is off.' : 'ON AIR sign is on.')} className={`sk-key ${btn}`}>
          {d.onAirSign === true ? 'On: tap to turn off' : 'Off: tap to turn on'}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-br-dk-sub font-display tracking-widest">audio processing</p>
        <p className="text-sm text-br-dk-sub">The website&apos;s real equalizer and the volume boost past 0 dB. Turn it off to play the stream straight through the browser with nothing in the sound path. Listeners pick it up within a few seconds; a stream that is already playing changes on its next start.</p>
        <button type="button" disabled={!!busy} aria-pressed={d.audioFx !== false}
                onClick={() => run('fx', { action: 'audio-fx', on: d.audioFx === false }, d.audioFx === false ? 'Audio processing is on.' : 'Audio processing is off.')} className={`sk-key ${btn}`}>
          {d.audioFx === false ? 'Off: tap to turn on' : 'On: tap to turn off'}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-br-dk-sub font-display tracking-widest">message to everyone</p>
        {d.announcement && <p className="text-sm text-br-gold">Live now: {d.announcement.text} <span className="text-br-dk-muted">(until {when(d.announcement.until)})</span></p>}
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={240} aria-label="Message to everyone"
                  placeholder="Shows on every page of the site and at the top of the app" className={field} />
        <div className="flex flex-wrap gap-2 items-center">
          <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text" aria-label="How long to show it">
            {[[15, '15 minutes'], [60, '1 hour'], [180, '3 hours'], [720, '12 hours']].map(([m, l]) => <option key={m} value={m}>{l}</option>)}
          </select>
          <button type="button" disabled={!!busy || !text.trim()} onClick={() => run('announce', { action: 'announce', text, minutes }, 'Sent to everyone.')} className={`sk-btn ${btn}`}>Send</button>
          {d.announcement && <button type="button" disabled={!!busy} onClick={() => run('clear', { action: 'clear-announcement' }, 'Message removed.')} className={`text-br-dk-sub ${btn}`}>Remove</button>}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-br-dk-sub font-display tracking-widest">message on one show</p>
        <select value={pick} onChange={e => { setPick(e.target.value); const s = d.shows.find(x => x.occId === e.target.value); setHeadline(s?.note?.headline ?? ''); setMessage(s?.note?.message ?? '') }} className={field} aria-label="Show">
          <option value="">{d.shows.find(s => s.onAir) ? 'On air now' : 'Choose a show'}</option>
          {d.shows.map(s => <option key={s.occId} value={s.occId}>{s.title} · {when(s.startAt)}{s.note ? ' · has message' : ''}</option>)}
        </select>
        <input value={headline} onChange={e => setHeadline(e.target.value)} maxLength={80} placeholder="Headline" aria-label="Headline" className={field} />
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} maxLength={400} placeholder="Details" aria-label="Details" className={field} />
        <div className="flex gap-2 items-center">
          <button type="button" disabled={!!busy} onClick={() => pin(false)} className={`sk-btn ${btn}`}>Pin</button>
          <button type="button" disabled={!!busy} onClick={() => pin(true)} className={`text-br-dk-sub ${btn}`}>Clear</button>
        </div>
      </div>
    </div>
  )
}
