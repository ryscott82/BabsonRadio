'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import ConfirmDialog from '../ConfirmDialog'

interface State { configured: boolean; announcement: { text: string; until: number } | null; onAirSign?: boolean; colorMode?: boolean; audioFx?: boolean; maintenance?: boolean }
type Panel = 'announce' | 'next' | 'sign' | 'color' | null
type Ask = 'emergency-stop' | 'resume' | null

const until = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The controls row: Skip song, Emergency stop (with a confirm box), ON AIR sign, Color mode, Announcement, Play a song next.
 * Nothing is read when the page opens. The state behind the switches (sign, color mode) is read once, the first time a panel is opened.
 * "More controls" (audio processing, maintenance mode) is drawn for Admins only; E-board never sees it.
 */
export default function Controls({ role }: { role: 'director' | 'admin' }) {
  const [d, setD] = useState<State | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [ask, setAsk] = useState<Ask>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ requestId: string; title: string; artist: string }[]>([])
  const admin = role === 'admin'

  const load = useCallback(() => { apiGet<State>('/api/admin/controls').then(setD).catch(e => setErr(e instanceof Error ? e.message : 'Could not read the controls.')) }, [])
  const needState = panel !== null || more
  useEffect(() => { if (needState && !d) queueMicrotask(load) }, [needState, d, load])

  async function run(key: string, body: Record<string, unknown>, ok: string) {
    setBusy(key); setErr(''); setMsg('')
    try { const r = await api<{ note?: string }>('/api/admin/controls', body); setMsg(r?.note || ok); load() }
    catch (e) { setErr(e instanceof Error ? e.message : 'That did not work.') }
    setBusy(''); setAsk(null)
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
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not queue it.') }
    setBusy('')
  }

  const big = 'ops-btn w-full min-h-[5.5rem] px-4 py-3 text-left flex flex-col justify-center disabled:opacity-50'
  const red = 'ops-btn-red w-full min-h-[5.5rem] px-4 py-3 text-left flex flex-col justify-center'
  const toggle = (p: Exclude<Panel, null>) => setPanel(x => (x === p ? null : p))
  const field = 'ops-field w-full min-h-11'
  const btn = 'ops-btn px-4 min-h-11 disabled:opacity-50'
  const loadingState = <p className="text-base" aria-busy>Reading the current state…</p>

  return (
    <section aria-label="Controls" className="space-y-4">
      <h2 className="text-2xl font-light">Controls</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <button type="button" className={big} disabled={!!busy} onClick={() => run('skip', { action: 'skip' }, 'Skipped.')}>
          <span className="text-2xl font-light">Skip song</span><span className="text-base opacity-90">Go to the next song</span>
        </button>
        <button type="button" className={red} onClick={() => setAsk('emergency-stop')}>
          <span className="text-2xl font-light">Emergency stop</span><span className="text-base">Takes the station off air</span>
        </button>
        <button type="button" className={big} onClick={() => setAsk('resume')}>
          <span className="text-2xl font-light">Resume</span><span className="text-base opacity-90">Bring the station back</span>
        </button>
        <button type="button" className={big} aria-pressed={panel === 'sign'} onClick={() => toggle('sign')}>
          <span className="text-2xl font-light">ON AIR sign</span><span className="text-base opacity-90">The light in the studio</span>
        </button>
        <button type="button" className={big} aria-pressed={panel === 'color'} onClick={() => toggle('color')}>
          <span className="text-2xl font-light">Color mode</span><span className="text-base opacity-90">Album colors at night</span>
        </button>
        <button type="button" className={big} aria-pressed={panel === 'announce'} onClick={() => toggle('announce')}>
          <span className="text-2xl font-light">Announcement</span><span className="text-base opacity-90">A message to everyone</span>
        </button>
        <button type="button" className={big} aria-pressed={panel === 'next'} onClick={() => toggle('next')}>
          <span className="text-2xl font-light">Play a song next</span><span className="text-base opacity-90">Pick the next song</span>
        </button>
      </div>

      {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-2">{err}</p>}
      {msg && <p role="status" className="text-base font-semibold">{msg}</p>}

      {panel === 'sign' && (
        <div className="ops-card p-4 space-y-3">
          <h3 className="text-xl font-light">ON AIR sign</h3>
          {!d ? loadingState : <>
            <p className="text-base opacity-90">It switches itself on during live shows. Turn it on by hand for other events. Right now it is {d.onAirSign === true ? 'on' : 'off'}.</p>
            <button type="button" className={btn} disabled={!!busy} aria-pressed={d.onAirSign === true}
                    onClick={() => run('sign', { action: 'on-air-sign', on: d.onAirSign !== true }, d.onAirSign === true ? 'ON AIR sign is off.' : 'ON AIR sign is on.')}>{d.onAirSign === true ? 'Turn it off' : 'Turn it on'}</button>
          </>}
        </div>
      )}
      {panel === 'color' && (
        <div className="ops-card p-4 space-y-3">
          <h3 className="text-xl font-light">Color mode</h3>
          {!d ? loadingState : <>
            <p className="text-base opacity-90">The site background follows the album colors while Auto DJ is on air at night. It changes the look for every listener. Right now it is {d.colorMode === true ? 'on' : 'off'}.</p>
            <button type="button" className={btn} disabled={!!busy} aria-pressed={d.colorMode === true}
                    onClick={() => run('color', { action: 'color-mode', on: d.colorMode !== true }, d.colorMode === true ? 'Color mode is off.' : 'Color mode is on.')}>{d.colorMode === true ? 'Turn it off' : 'Turn it on'}</button>
          </>}
        </div>
      )}
      {panel === 'announce' && (
        <div className="ops-card p-4 space-y-3">
          <h3 className="text-xl font-light">Announcement</h3>
          {!d ? loadingState : <>
            {d.announcement && <p className="text-base font-semibold">Live now: {d.announcement.text} <span className="font-normal opacity-80">(until {until(d.announcement.until)})</span></p>}
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={240} aria-label="Announcement" placeholder="Shows on every page and in the app" className={field} />
            <div className="flex flex-wrap gap-2 items-center">
              <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="ops-field min-h-11" aria-label="How long to show it">
                {[[15, '15 minutes'], [60, '1 hour'], [180, '3 hours'], [720, '12 hours']].map(([m, l]) => <option key={m} value={m}>{l}</option>)}
              </select>
              <button type="button" className={btn} disabled={!!busy || !text.trim()} onClick={() => run('announce', { action: 'announce', text, minutes }, 'Sent to everyone.')}>Send to everyone</button>
              {d.announcement && <button type="button" className={btn} disabled={!!busy} onClick={() => run('clear', { action: 'clear-announcement' }, 'Message removed.')}>Remove it</button>}
            </div>
          </>}
        </div>
      )}
      {panel === 'next' && (
        <div className="ops-card p-4 space-y-3">
          <h3 className="text-xl font-light">Play a song next</h3>
          <form onSubmit={e => { e.preventDefault(); if (q.trim().length > 1) search() }} className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} maxLength={80} placeholder="Song or artist" aria-label="Song or artist" className={field} />
            <button type="submit" disabled={!!busy || q.trim().length < 2} className={btn}>Search</button>
          </form>
          {found.length > 0 && (
            <ul className="space-y-2">
              {found.map(s => (
                <li key={s.requestId} className="flex items-center justify-between gap-2 text-base">
                  <span className="min-w-0 flex-1">{s.title}<span className="opacity-80"> · {s.artist}</span></span>
                  <button type="button" disabled={!!busy} onClick={() => playNext(s)} className={`shrink-0 ${btn}`}>Play next</button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-base opacity-90">It plays before votes and the schedule. Not for live shows.</p>
        </div>
      )}

      {admin && (
        <div className="space-y-3">
          <button type="button" className={btn} aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? 'Hide more controls' : 'More controls'}</button>
          {more && (
            <div className="grid md:grid-cols-2 gap-4">
              {!d ? loadingState : <>
                <div className="ops-card p-4 space-y-3">
                  <h3 className="text-xl font-light">Audio processing</h3>
                  <p className="text-base opacity-90">The website equalizer and volume boost for every listener. Off plays the raw stream.</p>
                  <button type="button" className={btn} disabled={!!busy} aria-pressed={d.audioFx !== false}
                          onClick={() => run('fx', { action: 'audio-fx', on: d.audioFx === false }, d.audioFx === false ? 'Audio processing is on.' : 'Audio processing is off.')}>{d.audioFx === false ? 'Off: turn on' : 'On: turn off'}</button>
                </div>
                <div className="ops-card p-4 space-y-3">
                  <h3 className="text-xl font-light">Maintenance mode</h3>
                  <p className="text-base opacity-90">While on, the site and the app say &quot;Babson Radio will be back shortly&quot; to every listener. It does not stop the audio. Use Emergency stop for that.</p>
                  <button type="button" className={btn} disabled={!!busy} aria-pressed={d.maintenance === true}
                          onClick={() => run('maintenance', { action: 'maintenance', on: d.maintenance !== true }, d.maintenance === true ? 'Maintenance mode is off.' : 'Maintenance mode is on.')}>{d.maintenance === true ? 'On: turn off' : 'Off: turn on'}</button>
                </div>
              </>}
            </div>
          )}
        </div>
      )}

      {ask && (
        <ConfirmDialog
          title={ask === 'emergency-stop' ? 'Take the station off air?' : 'Bring the station back?'}
          body={ask === 'emergency-stop'
            ? 'Every listener on the site and in the app loses the stream right away, and the other admins get a notification. It stays off until someone presses Resume.'
            : 'The stream starts again for every listener on the site and in the app.'}
          action={ask === 'emergency-stop' ? 'Stop the station' : 'Resume'} busy={!!busy} onNo={() => setAsk(null)}
          onYes={() => run(ask, { action: ask }, ask === 'resume' ? 'Back on air.' : 'Station stopped.')} />
      )}
    </section>
  )
}
