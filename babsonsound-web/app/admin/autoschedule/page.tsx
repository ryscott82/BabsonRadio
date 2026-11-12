'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { DEFAULT_CONFIG, type AutoConfig } from '@/lib/autoschedule'
import { fullConfig, plainSaveError, savePayload, showsAdvanced, type AutoRole } from '@/lib/autoPage'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'
import AutoPlanner from '@/components/admin/AutoPlanner'
import AutoWeights from '@/components/admin/AutoWeights'

interface Block { startMs: number; endMs: number; label: string; ruleId: string }
interface Sync { updated: { playlist: string; blocks: number }[]; missing: string[]; error?: string }
interface RunResult { blocks: Block[]; kept: number; written: boolean; azuracast?: Sync }
interface Status { configured: boolean; ok: boolean; error?: string; playlists: { name: string; enabled: boolean }[]; genres: { genre: string; playlist: string; found: boolean }[] }

const when = (ms: number) =>
  new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

const pad = (n: number) => String(n).padStart(2, '0')
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Fix the schedule by hand: this playlist really played from X until Y (or is still playing). */
function CorrectSchedule({ box, lab }: { box: string; lab: string }) {
  const [label, setLabel] = useState('Pop Hits')
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(13, 0, 0, 0); return localInput(d) })
  const [end, setEnd] = useState(() => localInput(new Date()))
  const [ongoing, setOngoing] = useState(true)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true); setMsg('')
    try {
      await api('/api/admin/schedule-correction', { label, startAt: new Date(start).getTime(), endAt: new Date(end).getTime(), ongoing })
      setMsg('Saved. The schedule and calendar now show it.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }
  return (
    <section className="sk-raised rounded-2xl p-5 space-y-3">
      <h2 className="font-display text-br-gold tracking-widest text-sm">Correct the schedule</h2>
      <p className="text-base text-br-dk-sub">Tell it what really played. It replaces the planned blocks for that time on the schedule, the app and the calendar. If it is still playing, the site keeps it going automatically.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className={lab}>Playlist</label><input className={box + ' w-full'} value={label} onChange={e => setLabel(e.target.value)} /></div>
        <div><label className={lab}>Started</label><input type="datetime-local" className={box + ' w-full'} value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className={lab}>Ended</label><input type="datetime-local" className={box + ' w-full'} value={end} disabled={ongoing} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-base text-br-dk-sub"><input type="checkbox" checked={ongoing} onChange={e => setOngoing(e.target.checked)} /> It is still playing</label>
      <PrimaryButton type="button" busy={busy} onClick={save}>Save correction</PrimaryButton>
      {msg && <p className="text-base text-br-dk-sub">{msg}</p>}
    </section>
  )
}

export default function AutoSchedulePage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [role, setRole] = useState<AutoRole | null>(null)
  const [cfg, setCfg] = useState<AutoConfig | null>(null)
  const [calendarUrl, setCalendarUrl] = useState('')
  const [preview, setPreview] = useState<RunResult | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [sync, setSync] = useState<Sync | null>(null)
  const [extraGenres, setExtraGenres] = useState<string[]>([])

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace('/') }, [loading, user, isDirector, router])
  useEffect(() => {
    if (!user || !isDirector) return
    apiGet<{ role: AutoRole; config: Partial<AutoConfig>; calendarUrl?: string }>('/api/admin/autoschedule')
      .then(r => { setRole(r.role === 'admin' ? 'admin' : 'director'); setCfg(fullConfig(r.config)); setCalendarUrl(r.calendarUrl ?? '') })
      .catch(e => setError(plainSaveError(e)))
  }, [user, isDirector])

  if (!user || !isDirector) return null
  if (!cfg || !role) return error ? <p className="p-6 text-base text-br-red">{error}</p> : null
  const admin = showsAdvanced(role)

  const update = (patch: Partial<AutoConfig>) => setCfg({ ...cfg, ...patch })
  const genres = Array.from(new Set([...extraGenres, ...cfg.defaultFillers, ...cfg.rules.flatMap(r => r.fillers)]))
  const setGenres = (g: string[]) => setExtraGenres(g)
  const lines = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(plainSaveError(e)) }
    setBusy('')
  }
  // A Director's save sends only the rules and default playlists; an Admin's sends everything.
  const persist = async () => {
    const r = await api<{ config: Partial<AutoConfig> }>('/api/admin/autoschedule', savePayload(cfg, role))
    setCfg(fullConfig(r.config))
  }
  const save = () => run('save', async () => { await persist(); setNotice('Saved. It applies the next time the scheduler runs.') })
  const check = () => run('check', async () => { await persist(); setStatus(await apiGet<Status>('/api/admin/autoschedule/azuracast')) })
  const syncNow = () => run('sync', async () => {
    await persist()
    const r = await api<Sync>('/api/admin/autoschedule/azuracast', {})
    setSync(r)
    setNotice(r.error ? '' : 'Sent to AzuraCast.')
    if (r.error) setError(r.error)
  })
  const runNow = (dryRun: boolean) => run(dryRun ? 'preview' : 'rebuild', async () => {
    if (!dryRun) await persist() // run with what's on screen
    const r = await api<RunResult>('/api/admin/autoschedule/run', { dryRun })
    setPreview(r); setSync(r.azuracast ?? null)
    setNotice(dryRun ? 'Preview only. Nothing was changed.' : 'Rebuilt. The schedule is updated.')
  })

  const box = 'sk-field rounded-lg px-3 py-2 text-base text-br-dk-text focus:outline-none min-h-11'
  const lab = 'block text-base text-br-dk-sub mb-1'
  const btn = 'sk-key rounded-lg px-4 py-2 text-base text-br-dk-text disabled:opacity-50 min-h-11'

  return (
    <div className="px-5 lg:px-8 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Auto DJ</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>

      {/* Rules and playlists: Directors and Admins */}
      <section className="space-y-6" aria-labelledby="rules-h">
        <h2 id="rules-h" className="text-xl font-light text-br-dk-text">Rules and playlists</h2>
        <p className="text-base text-br-dk-sub">
          Auto DJ is <strong>{cfg.enabled ? 'on' : 'off'}</strong>.{!admin && ' Only an Admin can switch it on or off.'} Pick a playlist, set when it plays, and turn a block off to keep it without scheduling it.
        </p>

        <AutoPlanner cfg={cfg} update={update} genres={genres} setGenres={setGenres} />

        <div className="sk-raised rounded-2xl p-5 space-y-3">
          <label className="block"><span className={lab}>Default playlists when no block applies (comma separated)</span>
            <input className={`${box} w-full`} key={cfg.defaultFillers.join('|')} defaultValue={cfg.defaultFillers.join(', ')}
                   onBlur={e => update({ defaultFillers: lines(e.target.value) })} /></label>
          <button type="button" className={btn}
                  onClick={() => { if (window.confirm('Replace all blocks with the suggested schedule? Nothing is saved until you press Save.')) update({ rules: DEFAULT_CONFIG.rules.map(r => ({ ...r })) }) }}>
            Load suggested schedule
          </button>
        </div>

        <ErrorText>{error}</ErrorText>
        {notice && <p className="text-base text-br-gold">{notice}</p>}
        <div className="grid sm:grid-cols-3 gap-3">
          <PrimaryButton busy={busy === 'rebuild'} onClick={() => runNow(false)}>Rebuild now</PrimaryButton>
          <button className={btn} disabled={!!busy} onClick={() => runNow(true)}>{busy === 'preview' ? 'One moment…' : 'Preview a rebuild'}</button>
          <button className={btn} disabled={!!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save without rebuilding'}</button>
        </div>

        {preview && (
          <div className="space-y-3">
            <h3 className="text-xl font-light text-br-dk-text">
              {preview.written ? 'Scheduled' : 'Preview'}: {preview.blocks.length} new blocks{preview.kept ? ` (+${preview.kept} locked)` : ''}
            </h3>
            {preview.blocks.length === 0 && <p className="text-base text-br-dk-sub">Nothing to fill.</p>}
            <div className="sk-raised rounded-xl divide-y divide-br-dk-border">
              {preview.blocks.map(b => (
                <div key={b.startMs} className="flex justify-between gap-4 px-4 py-2.5 text-base">
                  <span className="text-br-dk-text">{b.label}</span>
                  <span className="text-br-dk-sub text-right">{when(b.startMs)} – {when(b.endMs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <CorrectSchedule box={box} lab={lab} />
      </section>

      {/* Admins only. For a Director this is not rendered at all. */}
      {admin && (
        <details className="sk-raised rounded-2xl p-5" data-testid="auto-advanced">
          <summary className="cursor-pointer select-none text-xl font-light text-br-dk-text min-h-11">Advanced (Admins only)</summary>
          <div className="pt-5 space-y-8">
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-base text-br-dk-text min-h-11">
                <input type="checkbox" className="w-5 h-5" checked={cfg.enabled} onChange={e => update({ enabled: e.target.checked })} />
                Auto DJ is on (the master switch)
              </label>
              <label className="flex items-center gap-3 text-base text-br-dk-text min-h-11">
                <input type="checkbox" className="w-5 h-5" checked={cfg.learn !== false} onChange={e => update({ learn: e.target.checked })} />
                Play more of what listeners like <a href="/admin/insights" className="underline text-br-dk-sub">what it learned</a>
              </label>
              <label className="flex items-center gap-3 text-base text-br-dk-text min-h-11">
                <input type="checkbox" className="w-5 h-5" checked={cfg.colorChanging === true} onChange={e => update({ colorChanging: e.target.checked })} />
                Color-changing background at night
              </label>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <label><span className={lab}>Time zone</span>
                <input className={`${box} w-full`} value={cfg.timezone} onChange={e => update({ timezone: e.target.value })} /></label>
              <label><span className={lab}>Fill ahead (hours)</span>
                <input type="number" min={6} max={168} className={`${box} w-full`} value={cfg.horizonHours} onChange={e => update({ horizonHours: Number(e.target.value) })} /></label>
              <label><span className={lab}>Planning grid (minutes)</span>
                <select className={`${box} w-full`} value={cfg.stepMinutes} onChange={e => update({ stepMinutes: Number(e.target.value) })}>
                  {[15, 30, 60].map(n => <option key={n} value={n}>{n}</option>)}
                </select></label>
              <label><span className={lab}>Longest block (min)</span>
                <input type="number" min={30} max={360} step={30} className={`${box} w-full`} value={cfg.maxBlockMinutes} onChange={e => update({ maxBlockMinutes: Number(e.target.value) })} /></label>
              <label><span className={lab}>Lock next (min)</span>
                <input type="number" min={0} max={360} step={15} className={`${box} w-full`} value={cfg.lockMinutes} onChange={e => update({ lockMinutes: Number(e.target.value) })} /></label>
            </div>

            <AutoWeights cfg={cfg} genres={genres} update={update} />

            <div className="space-y-4">
              <h3 className="text-xl font-light text-br-dk-text">AzuraCast</h3>
              <label className="flex items-center gap-3 text-base text-br-dk-text min-h-11">
                <input type="checkbox" className="w-5 h-5" checked={cfg.syncToAzuraCast} onChange={e => update({ syncToAzuraCast: e.target.checked })} />
                Send to AzuraCast after every rebuild
              </label>
              <div className="flex flex-wrap gap-3">
                <button className={btn} disabled={!!busy} onClick={check}>{busy === 'check' ? 'Checking…' : 'Check connection'}</button>
                <button className={btn} disabled={!!busy} onClick={syncNow}>{busy === 'sync' ? 'Sending…' : 'Send now'}</button>
              </div>
              {status && !status.configured && <p className="text-base text-br-red">Not connected. Set AZURACAST_URL, AZURACAST_API_KEY and AZURACAST_STATION_ID in Vercel.</p>}
              {status?.configured && !status.ok && <p className="text-base text-br-red break-words">{status.error}</p>}
              {status?.ok && (
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-base">
                  {status.genres.map(g => (
                    <li key={g.genre} className="flex items-center gap-2">
                      <span className={g.found ? 'text-br-green' : 'text-br-red'}>{g.found ? '✓' : '✗'}</span>
                      <span className="text-br-dk-text">{g.genre}</span>
                      {!g.found && <span className="text-br-dk-sub">needs a playlist named &ldquo;{g.playlist}&rdquo;</span>}
                    </li>
                  ))}
                </ul>
              )}
              {sync && !sync.error && (
                <div className="text-base text-br-dk-sub">
                  Updated {sync.updated.length} playlist{sync.updated.length === 1 ? '' : 's'}.
                  {sync.missing.length > 0 && <span className="text-br-red"> Missing in AzuraCast: {sync.missing.join(', ')}.</span>}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-xl font-light text-br-dk-text">Playlist map</h3>
              <p className="text-base text-br-dk-sub">Only needed when an AzuraCast playlist has a different name. Leave blank to use the same name.</p>
              <ul className="grid sm:grid-cols-2 gap-3">
                {genres.map(g => (
                  <li key={g}>
                    <label><span className={lab}>{g}</span>
                      <input className={`${box} w-full`} placeholder={g} defaultValue={cfg.playlistMap[g] ?? ''}
                             onBlur={e => { const next = { ...cfg.playlistMap }; const v = e.target.value.trim(); if (v) next[g] = v; else delete next[g]; update({ playlistMap: next }) }} /></label>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-xl font-light text-br-dk-text">Calendar feed</h3>
              <input readOnly value={calendarUrl} onFocus={e => e.currentTarget.select()} className="sk-field w-full rounded-lg px-3 py-2 text-base text-br-dk-text min-h-11" />
              <div className="flex flex-wrap gap-3">
                <button className={btn} onClick={() => navigator.clipboard?.writeText(calendarUrl).then(() => setNotice('Calendar link copied.'))}>Copy link</button>
                <a className={btn + ' inline-flex items-center'} href={calendarUrl.replace(/^https?:/, 'webcal:')}>Open in calendar app</a>
                <a className={btn + ' inline-flex items-center'} href={calendarUrl.replace('/api/calendar.ics', '/api/calendar-music.ics').replace(/^https?:/, 'webcal:')}>Auto DJ calendar</a>
              </div>
            </div>
            <button className={btn} disabled={!!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save without rebuilding'}</button>
          </div>
        </details>
      )}
    </div>
  )
}
