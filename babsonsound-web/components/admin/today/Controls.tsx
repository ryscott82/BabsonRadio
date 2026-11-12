'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import ConfirmDialog from '../ConfirmDialog'
import IconButton from '../IconButton'
import { MORE_SWITCHES, buttonsFor, type ControlId } from '@/lib/controlButtons'

interface State { configured: boolean; announcement: { text: string; until: number } | null; onAirSign?: boolean; colorMode?: boolean; audioFx?: boolean; maintenance?: boolean }
type Panel = 'announce' | 'next' | 'more' | null
type Ask = 'emergency-stop' | 'resume' | null

const until = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The controls: one row of icon buttons (skip, emergency stop, resume, ON AIR sign, color mode, announcement, play a song next, and for Admins More).
 * The switches (sign, color mode, announcement) show on or off on their icon, so the state is read once when the row appears. It is never polled.
 * Emergency stop and Resume ask first. "More" (audio processing, maintenance mode) is drawn for Admins only; E-board never sees it.
 */
export default function Controls({ role }: { role: 'director' | 'admin' }) {
  const [d, setD] = useState<State | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [ask, setAsk] = useState<Ask>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ requestId: string; title: string; artist: string }[]>([])

  const load = useCallback(() => { apiGet<State>('/api/admin/controls').then(setD).catch(e => setErr(e instanceof Error ? e.message : 'Could not read the controls.')) }, [])
  useEffect(() => { queueMicrotask(load) }, [load])

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

  const toggle = (p: Exclude<Panel, null>) => setPanel(x => (x === p ? null : p))
  const field = 'ops-field w-full min-h-11'
  const btn = 'ops-btn px-4 min-h-11 disabled:opacity-50'
  const on = (id: ControlId): boolean | undefined => id === 'sign' ? (d ? d.onAirSign === true : undefined) : id === 'color' ? (d ? d.colorMode === true : undefined) : id === 'announce' ? (d ? d.announcement !== null : undefined) : undefined
  const press = (id: ControlId) => {
    if (id === 'skip') return run('skip', { action: 'skip' }, 'Skipped.')
    if (id === 'emergency-stop' || id === 'resume') return setAsk(id)
    if (id === 'sign') return run('sign', { action: 'on-air-sign', on: d?.onAirSign !== true }, d?.onAirSign === true ? 'ON AIR sign is off.' : 'ON AIR sign is on.')
    if (id === 'color') return run('color', { action: 'color-mode', on: d?.colorMode !== true }, d?.colorMode === true ? 'Color mode is off.' : 'Color mode is on.')
    toggle(id === 'announce' ? 'announce' : id === 'next' ? 'next' : 'more')
  }
  const panelOf: Partial<Record<ControlId, Panel>> = { announce: 'announce', next: 'next', more: 'more' }

  return (
    <section aria-label="Controls" className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-4 pb-4">
        {buttonsFor(role).map(b => (
          <IconButton key={b.id} label={b.label} tip={b.tip} icon={b.icon} red={b.red} on={on(b.id)}
                      pressed={panelOf[b.id] ? panel === panelOf[b.id] : undefined} expanded={panelOf[b.id] ? panel === panelOf[b.id] : undefined}
                      busy={!!busy && !panelOf[b.id]} onClick={() => press(b.id)} />
        ))}
      </div>

      {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-2">{err}</p>}
      {msg && <p role="status" className="text-base font-semibold">{msg}</p>}

      {panel === 'announce' && (
        <div className="ops-card p-4 space-y-3">
          <h3 className="text-xl font-light">Announcement</h3>
          {d?.announcement && <p className="text-base font-semibold">Live now: {d.announcement.text} <span className="font-normal opacity-80">(until {until(d.announcement.until)})</span></p>}
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={240} aria-label="Announcement" placeholder="Shows on every page and in the app" className={field} />
          <div className="flex flex-wrap gap-2 items-center">
            <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="ops-field min-h-11" aria-label="How long to show it">
              {[[15, '15 minutes'], [60, '1 hour'], [180, '3 hours'], [720, '12 hours']].map(([m, l]) => <option key={m} value={m}>{l}</option>)}
            </select>
            <button type="button" className={btn} disabled={!!busy || !text.trim()} onClick={() => run('announce', { action: 'announce', text, minutes }, 'Sent to everyone.')}>Send to everyone</button>
            {d?.announcement && <button type="button" className={btn} disabled={!!busy} onClick={() => run('clear', { action: 'clear-announcement' }, 'Message removed.')}>Remove it</button>}
          </div>
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
        </div>
      )}
      {role === 'admin' && panel === 'more' && (
        <div className="ops-card p-4 flex flex-wrap gap-x-6 gap-y-4 pb-8" aria-label="More controls">
          {MORE_SWITCHES.map(m => {
            const isOn = m.id === 'audio-fx' ? d?.audioFx !== false : d?.maintenance === true
            return <IconButton key={m.id} label={m.label} tip={m.tip} icon={m.icon} caption on={d ? isOn : undefined} busy={!!busy || !d}
                               onClick={() => m.id === 'audio-fx'
                                 ? run('fx', { action: 'audio-fx', on: d?.audioFx === false }, d?.audioFx === false ? 'Audio processing is on.' : 'Audio processing is off.')
                                 : run('maintenance', { action: 'maintenance', on: d?.maintenance !== true }, d?.maintenance === true ? 'Maintenance mode is off.' : 'Maintenance mode is on.')} />
          })}
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
