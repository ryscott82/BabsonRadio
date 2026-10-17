'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { DEFAULT_CONFIG, type AutoConfig, type AutoRule } from '@/lib/autoschedule'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'

interface Block { startMs: number; endMs: number; label: string; ruleId: string }
interface Sync { updated: { playlist: string; blocks: number }[]; missing: string[]; error?: string }
interface RunResult { blocks: Block[]; kept: number; written: boolean; azuracast?: Sync }
interface Status { configured: boolean; ok: boolean; error?: string; playlists: { name: string; enabled: boolean }[]; genres: { genre: string; playlist: string; found: boolean }[] }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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
      <h2 className="font-display text-br-gold tracking-widest text-sm">CORRECT THE SCHEDULE</h2>
      <p className="text-sm text-br-dk-sub">Tell it what really played. It replaces the planned blocks for that time on the schedule, the app and the calendar. If it is still playing, the site keeps it going automatically.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className={lab}>PLAYLIST</label><input className={box + ' w-full'} value={label} onChange={e => setLabel(e.target.value)} /></div>
        <div><label className={lab}>STARTED</label><input type="datetime-local" className={box + ' w-full'} value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className={lab}>ENDED</label><input type="datetime-local" className={box + ' w-full'} value={end} disabled={ongoing} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-xs text-br-dk-sub"><input type="checkbox" checked={ongoing} onChange={e => setOngoing(e.target.checked)} /> It is still playing</label>
      <PrimaryButton type="button" busy={busy} onClick={save}>SAVE CORRECTION</PrimaryButton>
      {msg && <p className="text-xs text-br-dk-sub">{msg}</p>}
    </section>
  )
}

export default function AutoSchedulePage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [cfg, setCfg] = useState<AutoConfig | null>(null)
  const [calendarUrl, setCalendarUrl] = useState('')
  const [preview, setPreview] = useState<RunResult | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [sync, setSync] = useState<Sync | null>(null)

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (!user || !isAdmin) return
    apiGet<{ config: AutoConfig; calendarUrl: string }>('/api/admin/autoschedule')
      .then(r => { setCfg(r.config); setCalendarUrl(r.calendarUrl) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load settings.'))
  }, [user, isAdmin])

  if (!user || !isAdmin || !cfg) return null

  const update = (patch: Partial<AutoConfig>) => setCfg({ ...cfg, ...patch })
  const setRule = (i: number, patch: Partial<AutoRule>) =>
    update({ rules: cfg.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const toggleDay = (i: number, d: number) => {
    const days = cfg.rules[i].days
    setRule(i, { days: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort() })
  }
  const lines = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') }
    setBusy('')
  }
  const save = () => run('save', async () => {
    const r = await api<{ config: AutoConfig }>('/api/admin/autoschedule', { config: cfg })
    setCfg(r.config); setNotice('Settings saved. They apply the next time the scheduler runs.')
  })
  const check = () => run('check', async () => {
    await api('/api/admin/autoschedule', { config: cfg })
    setStatus(await apiGet<Status>('/api/admin/autoschedule/azuracast'))
  })
  const syncNow = () => run('sync', async () => {
    await api('/api/admin/autoschedule', { config: cfg })
    const r = await api<Sync>('/api/admin/autoschedule/azuracast', {})
    setSync(r)
    setNotice(r.error ? '' : 'Sent to AzuraCast.')
    if (r.error) setError(r.error)
  })
  const runNow = (dryRun: boolean) => run(dryRun ? 'preview' : 'rebuild', async () => {
    if (!dryRun) await api('/api/admin/autoschedule', { config: cfg }) // run with what's on screen
    const r = await api<RunResult>('/api/admin/autoschedule/run', { dryRun })
    setPreview(r); setSync(r.azuracast ?? null)
    setNotice(dryRun ? 'Preview only. Nothing was changed.' : 'Rebuilt. The schedule is updated.')
  })

  const box = 'sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text focus:outline-none'
  const lab = 'block text-xs text-br-dk-sub mb-1 font-display tracking-widest'
  const btn = 'sk-key rounded-lg px-4 py-2 text-xs font-display tracking-widest text-br-dk-text disabled:opacity-50'
  // Every genre that appears in any rule, so each rule can switch them on and off with one tap.
  const allGenres = Array.from(new Set([...cfg.defaultFillers, ...cfg.rules.flatMap(r => r.fillers)]))
  const toggleGenre = (i: number, g: string) => {
    const f = cfg.rules[i].fillers
    setRule(i, { fillers: f.includes(g) ? f.filter(x => x !== g) : [...f, g] })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">AUTO DJ</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>

      {/* The few things most people ever change */}
      <section className="sk-raised rounded-2xl p-5 space-y-3">
        <label className="flex items-center gap-3 text-sm text-br-dk-text">
          <input type="checkbox" checked={cfg.enabled} onChange={e => update({ enabled: e.target.checked })} />
          Auto DJ is on
        </label>
        <label className="flex items-center gap-3 text-sm text-br-dk-text">
          <input type="checkbox" checked={cfg.learn !== false} onChange={e => update({ learn: e.target.checked })} />
          Play more of what listeners like <a href="/admin/insights" className="underline text-br-dk-sub">what it learned</a>
        </label>
        <label className="flex items-center gap-3 text-sm text-br-dk-text">
          <input type="checkbox" checked={cfg.colorChanging === true} onChange={e => update({ colorChanging: e.target.checked })} />
          Color-changing background at night
        </label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-br-gold tracking-widest text-sm">WHEN AND WHAT</h2>
          <button className={btn}
                  onClick={() => update({ rules: [...cfg.rules, {
                    id: `rule-${Date.now().toString(36)}`, name: 'New block', days: [1, 2, 3, 4, 5],
                    start: '12:00', end: '14:00', fillers: allGenres.slice(0, 2), priority: 10 }] })}>
            ADD
          </button>
        </div>
        {cfg.rules.map((r, i) => (
          <div key={r.id} className="sk-raised rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex-1 min-w-40"><span className={lab}>NAME</span>
                <input className={`${box} w-full`} value={r.name} onChange={e => setRule(i, { name: e.target.value })} /></label>
              <label><span className={lab}>FROM</span>
                <input type="time" className={box} value={r.start} onChange={e => setRule(i, { start: e.target.value })} /></label>
              <label><span className={lab}>TO</span>
                <input className={`${box} w-20`} value={r.end} onChange={e => setRule(i, { end: e.target.value })} placeholder="24:00" /></label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, n) => (
                <button key={d} type="button" aria-pressed={r.days.includes(n)} onClick={() => toggleDay(i, n)}
                        className="sk-key rounded-md px-2.5 py-1 text-xs font-display tracking-widest text-br-dk-text">{d}</button>
              ))}
            </div>
            {!r.quiet && (
              <div className="flex flex-wrap gap-1.5 items-center">
                {allGenres.map(g => (
                  <button key={g} type="button" aria-pressed={r.fillers.includes(g)} onClick={() => toggleGenre(i, g)}
                          className="sk-key rounded-full px-3 py-1 text-xs text-br-dk-text">{g}</button>
                ))}
                <input className={`${box} w-32 !py-1 text-xs`} placeholder="+ genre"
                       onKeyDown={e => {
                         if (e.key !== 'Enter') return
                         e.preventDefault()
                         const v = e.currentTarget.value.trim()
                         if (v && !r.fillers.includes(v)) setRule(i, { fillers: [...r.fillers, v] })
                         e.currentTarget.value = ''
                       }} />
              </div>
            )}
            <details className="text-xs text-br-dk-sub">
              <summary className="cursor-pointer select-none">More</summary>
              <div className="pt-3 space-y-3">
                <label className="flex items-center gap-3 text-sm text-br-dk-text">
                  <input type="checkbox" checked={r.quiet === true} onChange={e => setRule(i, { quiet: e.target.checked })} />
                  Nothing scheduled (AzuraCast&apos;s default playlist plays)
                </label>
                {!r.quiet && (
                  <label className="flex items-center gap-3 text-sm text-br-dk-text">
                    <input type="checkbox" checked={r.oneGenre === true} onChange={e => setRule(i, { oneGenre: e.target.checked })} />
                    One genre per night
                  </label>
                )}
                <div className="flex flex-wrap gap-3 items-end">
                  <label><span className={lab}>PRIORITY</span>
                    <input type="number" min={0} max={100} className={`${box} w-20`} value={r.priority}
                           onChange={e => setRule(i, { priority: Number(e.target.value) })} /></label>
                  <label><span className={lab}>LONGEST BLOCK (MIN)</span>
                    <input type="number" min={30} max={720} step={30} className={`${box} w-28`} value={r.blockMinutes ?? ''}
                           placeholder={String(cfg.maxBlockMinutes)}
                           onChange={e => setRule(i, { blockMinutes: e.target.value ? Number(e.target.value) : undefined })} /></label>
                  <button className="text-xs text-br-dk-sub hover:text-br-red pb-2"
                          onClick={() => update({ rules: cfg.rules.filter((_, j) => j !== i) })}>Delete block</button>
                </div>
              </div>
            </details>
          </div>
        ))}
      </section>

      <ErrorText>{error}</ErrorText>
      {notice && <p className="text-sm text-br-gold">{notice}</p>}
      <div className="grid grid-cols-2 gap-3">
        <PrimaryButton busy={busy === 'rebuild'} onClick={() => runNow(false)}>SAVE &amp; APPLY</PrimaryButton>
        <button className="sk-key rounded-xl py-3.5 text-sm font-display tracking-[0.2em] text-br-dk-text disabled:opacity-50"
                disabled={!!busy} onClick={() => runNow(true)}>{busy === 'preview' ? 'ONE MOMENT…' : 'PREVIEW'}</button>
      </div>

      {preview && (
        <section className="space-y-3">
          <h2 className="font-display text-br-gold tracking-widest text-sm">
            {preview.written ? 'SCHEDULED' : 'PREVIEW'} · {preview.blocks.length} NEW BLOCKS{preview.kept ? ` (+${preview.kept} LOCKED)` : ''}
          </h2>
          {preview.blocks.length === 0 && <p className="text-sm text-br-dk-sub">Nothing to fill.</p>}
          <div className="sk-raised rounded-xl divide-y divide-br-dk-border">
            {preview.blocks.map(b => (
              <div key={b.startMs} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="text-br-dk-text">{b.label}</span>
                <span className="text-br-dk-sub text-xs text-right">{when(b.startMs)} – {when(b.endMs)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Everything else, out of the way */}
      <details className="sk-raised rounded-2xl p-5">
        <summary className="cursor-pointer select-none font-display text-br-gold tracking-widest text-sm">ADVANCED</summary>
        <div className="pt-5 space-y-8">
          <div className="space-y-4">
            <div className="grid sm:grid-cols-4 gap-4">
              <label><span className={lab}>TIME ZONE</span>
                <input className={`${box} w-full`} value={cfg.timezone} onChange={e => update({ timezone: e.target.value })} /></label>
              <label><span className={lab}>FILL AHEAD (HOURS)</span>
                <input type="number" min={6} max={168} className={`${box} w-full`} value={cfg.horizonHours}
                       onChange={e => update({ horizonHours: Number(e.target.value) })} /></label>
              <label><span className={lab}>LONGEST BLOCK (MIN)</span>
                <input type="number" min={30} max={360} step={30} className={`${box} w-full`} value={cfg.maxBlockMinutes}
                       onChange={e => update({ maxBlockMinutes: Number(e.target.value) })} /></label>
              <label><span className={lab}>LOCK NEXT (MIN)</span>
                <input type="number" min={0} max={360} step={15} className={`${box} w-full`} value={cfg.lockMinutes}
                       onChange={e => update({ lockMinutes: Number(e.target.value) })} /></label>
            </div>
            <label className="block"><span className={lab}>FALLBACK GENRES (COMMA SEPARATED)</span>
              <input className={`${box} w-full`} defaultValue={cfg.defaultFillers.join(', ')}
                     onBlur={e => update({ defaultFillers: lines(e.target.value) })} /></label>
            <button className={btn}
                    onClick={() => { if (window.confirm('Replace all blocks with the suggested schedule? Nothing is saved until you press Save.')) update({ rules: DEFAULT_CONFIG.rules.map(r => ({ ...r })) }) }}>
              LOAD SUGGESTED SCHEDULE
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="font-display text-br-gold tracking-widest text-sm">AZURACAST</h2>
            <label className="flex items-center gap-3 text-sm text-br-dk-text">
              <input type="checkbox" checked={cfg.syncToAzuraCast} onChange={e => update({ syncToAzuraCast: e.target.checked })} />
              Send to AzuraCast after every rebuild
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={btn} disabled={!!busy} onClick={check}>{busy === 'check' ? 'CHECKING…' : 'CHECK CONNECTION'}</button>
              <button className={btn} disabled={!!busy} onClick={syncNow}>{busy === 'sync' ? 'SENDING…' : 'SEND NOW'}</button>
            </div>
            {status && !status.configured && (
              <p className="text-sm text-br-red">Not connected. Set AZURACAST_URL, AZURACAST_API_KEY and AZURACAST_STATION_ID in Vercel.</p>
            )}
            {status?.configured && !status.ok && <p className="text-sm text-br-red break-words">{status.error}</p>}
            {status?.ok && (
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {status.genres.map(g => (
                  <li key={g.genre} className="flex items-center gap-2">
                    <span className={g.found ? 'text-br-green' : 'text-br-red'}>{g.found ? '✓' : '✗'}</span>
                    <span className="text-br-dk-text">{g.genre}</span>
                    {!g.found && <span className="text-xs text-br-dk-sub">needs a playlist named &ldquo;{g.playlist}&rdquo;</span>}
                  </li>
                ))}
              </ul>
            )}
            {sync && !sync.error && (
              <div className="text-sm text-br-dk-sub">
                Updated {sync.updated.length} playlist{sync.updated.length === 1 ? '' : 's'}.
                {sync.missing.length > 0 && <span className="text-br-red"> Missing in AzuraCast: {sync.missing.join(', ')}.</span>}
              </div>
            )}
          </div>

          <CorrectSchedule box={box} lab={lab} />

          <div className="space-y-3">
            <h2 className="font-display text-br-gold tracking-widest text-sm">CALENDAR FEED</h2>
            <input readOnly value={calendarUrl} onFocus={e => e.currentTarget.select()}
                   className="sk-field w-full rounded-lg px-3 py-2 text-xs text-br-dk-text" />
            <div className="flex flex-wrap gap-3">
              <button className={btn}
                      onClick={() => navigator.clipboard?.writeText(calendarUrl).then(() => setNotice('Calendar link copied.'))}>COPY LINK</button>
              <a className={btn} href={calendarUrl.replace(/^https?:/, 'webcal:')}>OPEN IN CALENDAR APP</a>
              <a className={btn} href={calendarUrl.replace('/api/calendar.ics', '/api/calendar-autodj.ics').replace(/^https?:/, 'webcal:')}>AUTO DJ CALENDAR</a>
            </div>
          </div>
          <div>
            <button className={btn} disabled={!!busy} onClick={save}>{busy === 'save' ? 'SAVING…' : 'SAVE WITHOUT REBUILDING'}</button>
          </div>
        </div>
      </details>
    </div>
  )
}
