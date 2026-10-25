'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { apiGet } from '@/lib/auth'
import { DAYPARTS, localParts, planAutoBlocks, type AutoConfig, type AutoRule, type Daypart } from '@/lib/autoschedule'

// Auto DJ planner. Left: pick a playlist and edit when it plays. Right: the next 3 days as a grid, redrawn as you edit.
// The grid is a preview of these settings; real shows and booked slots are drawn in grey and the auto DJ works around them.

interface Item { id: string; source: string; title: string; startAt: number; endAt: number }
interface Stat { label: string; weight: number; samples: number; parts: Record<Daypart, number> }
interface Seg { startMs: number; endMs: number; label: string; real: boolean }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PX = 28            // pixels per hour on the grid
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const QUIET = '__quiet'

const on = (b: boolean): CSSProperties | undefined => (b ? { borderColor: 'var(--br-accent)', color: 'var(--br-accent)', background: 'var(--br-surface2)' } : undefined)

function clock(s: string) {
  const [h, m] = s.split(':').map(Number)
  if (Number.isNaN(h)) return s
  const hh = h % 24
  const t = `${hh % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}`
  return `${t}${hh < 12 || h === 24 ? 'a' : 'p'}`
}
function dayText(days: number[]) {
  if (days.length === 7) return 'Every day'
  const d = [...days].sort()
  if (d.join() === '1,2,3,4,5') return 'Mon–Fri'
  if (d.join() === '0,6') return 'Weekends'
  return d.map(x => DAY_NAMES[x]).join(' ')
}
const windowText = (r: AutoRule) => `${dayText(r.days)} ${clock(r.start)}–${clock(r.end)}`

// A stable color per playlist name.
function hue(label: string) { let h = 0; for (const c of label) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

export default function AutoPlanner({ cfg, update, genres, setGenres }: {
  cfg: AutoConfig; update: (p: Partial<AutoConfig>) => void; genres: string[]; setGenres: (g: string[]) => void
}) {
  const [sel, setSel] = useState<string>(genres[0] ?? QUIET)
  const [newName, setNewName] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [now] = useState(() => Date.now())
  const [stats, setStats] = useState<Stat[]>([])
  const grid = useRef<HTMLDivElement | null>(null)

  useEffect(() => { apiGet<{ items: Item[] }>('/api/schedule?days=4').then(r => setItems(r.items)).catch(() => {}) }, [])
  useEffect(() => { apiGet<{ stats: Stat[] }>('/api/admin/insights').then(r => setStats(r.stats)).catch(() => {}) }, [])
  useEffect(() => { grid.current?.scrollTo({ top: Math.max(0, (new Date().getHours() - 1) * PX) }) }, [])

  const box = 'sk-field px-2 py-1.5 text-sm text-br-dk-text'
  const lab = 'block text-sm text-br-dk-sub mb-1'
  const setRule = (id: string, patch: Partial<AutoRule>) => update({ rules: cfg.rules.map(r => (r.id === id ? { ...r, ...patch } : r)) })
  const toggleDay = (r: AutoRule, d: number) => setRule(r.id, { days: r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d].sort() })
  const withGenre = (r: AutoRule, g: string) => setRule(r.id, { fillers: r.fillers.includes(g) ? r.fillers.filter(x => x !== g) : [...r.fillers, g] })
  const newRule = (extra: Partial<AutoRule>): AutoRule => ({ id: `rule-${Date.now().toString(36)}`, name: 'New block', days: [1, 2, 3, 4, 5], start: '12:00', end: '14:00', fillers: [], priority: 10, ...extra })

  function removePlaylist(g: string) {
    update({
      rules: cfg.rules.map(r => ({ ...r, fillers: r.fillers.filter(x => x !== g) })).filter(r => r.quiet || r.fillers.length > 0),
      defaultFillers: cfg.defaultFillers.filter(x => x !== g),
    })
    setGenres(genres.filter(x => x !== g)); setSel(genres.find(x => x !== g) ?? QUIET)
  }
  function addPlaylist() {
    const v = newName.trim()
    if (!v) return
    if (!genres.includes(v)) { update({ defaultFillers: [...cfg.defaultFillers, v] }); setGenres([...genres, v]) }
    setSel(v); setNewName('')
  }

  // ── The grid: three days from the start of today in station time ──
  const dayStart = useMemo(() => {
    const p = localParts(now, cfg.timezone)
    return Math.floor(now / 60_000) * 60_000 - p.minutes * 60_000
  }, [now, cfg.timezone])
  const segs = useMemo<Seg[]>(() => {
    const real = items.filter(i => i.source !== 'auto').map(i => ({ startMs: i.startAt, endMs: i.endAt, label: i.title, real: true }))
    let plan: Seg[] = []
    try {
      plan = planAutoBlocks({ cfg, fromMs: dayStart, untilMs: dayStart + 3 * DAY_MS, busy: real, weekly: [],
        weights: Object.fromEntries(stats.map(x => [x.label.toLowerCase(), x.weight])),
        partWeights: Object.fromEntries(stats.map(x => [x.label.toLowerCase(), x.parts])) })
        .map(b => ({ startMs: b.startMs, endMs: b.endMs, label: b.label, real: false }))
    } catch { /* an unfinished setting: show only the real shows */ }
    return [...plan, ...real]
  }, [cfg, items, dayStart, stats])

  const key = sel.toLowerCase()
  const stat = stats.find(x => x.label.toLowerCase() === key)
  const manual = cfg.weightOverrides?.[key]
  const setManual = (v: number | undefined) => {
    const next = { ...(cfg.weightOverrides ?? {}) }
    if (v === undefined) delete next[key]; else next[key] = Math.round(v * 100) / 100
    update({ weightOverrides: next })
  }
  const rulesFor = sel === QUIET ? cfg.rules.filter(r => r.quiet) : cfg.rules.filter(r => !r.quiet && r.fillers.includes(sel))
  const others = (r: AutoRule) => r.fillers.filter(x => x !== sel)

  // Called as a function (not a component) so typing in a field never remounts it.
  function renderRule(r: AutoRule) {
    const quiet = sel === QUIET
    const shared = quiet ? [] : others(r)
    return (
      <div className="border border-br-dk-border p-3 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-32"><span className={lab}>Block name</span>
            <input className={`${box} w-full`} value={r.name} onChange={e => setRule(r.id, { name: e.target.value })} /></label>
          <label><span className={lab}>From</span>
            <input type="time" className={box} value={r.start} onChange={e => setRule(r.id, { start: e.target.value })} /></label>
          <label><span className={lab}>To</span>
            <input className={`${box} w-20`} value={r.end} onChange={e => setRule(r.id, { end: e.target.value })} placeholder="24:00" /></label>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
          {DAY_NAMES.map((d, n) => (
            <button key={d} type="button" aria-pressed={r.days.includes(n)} onClick={() => toggleDay(r, n)} style={on(r.days.includes(n))}
                    className="sk-key px-2.5 py-1 text-sm">{d}</button>
          ))}
        </div>
        {!quiet && (
          <div className="flex flex-wrap gap-3 items-end">
            <label><span className={lab}>Segment length (min)</span>
              <input type="number" min={30} max={720} step={30} className={`${box} w-28`} value={r.blockMinutes ?? ''} placeholder={String(cfg.maxBlockMinutes)}
                     onChange={e => setRule(r.id, { blockMinutes: e.target.value ? Number(e.target.value) : undefined })} /></label>
            <label><span className={lab}>Priority</span>
              <input type="number" min={0} max={100} className={`${box} w-20`} value={r.priority} onChange={e => setRule(r.id, { priority: Number(e.target.value) })} /></label>
          </div>
        )}
        {shared.length > 0 && <p className="text-sm text-br-dk-muted">Also plays here: {shared.join(', ')}. Time changes apply to all of them.</p>}
        <div className="flex flex-wrap gap-4 text-sm">
          {!quiet && <label className="flex items-center gap-2 text-br-dk-text"><input type="checkbox" checked={r.oneGenre === true} onChange={e => setRule(r.id, { oneGenre: e.target.checked })} /> One playlist per night</label>}
          {!quiet && <button type="button" className="text-br-dk-sub hover:text-br-gold" onClick={() => withGenre(r, sel)}>Remove {sel} from this block</button>}
          <button type="button" className="text-br-dk-sub hover:text-br-red" onClick={() => update({ rules: cfg.rules.filter(x => x.id !== r.id) })}>Delete block</button>
        </div>
      </div>
    )
  }

  const hours = Array.from({ length: 24 }, (_, h) => h)
  const nowTop = ((now - dayStart) / HOUR_MS) * PX

  return (
    <div className="grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-4 items-start">
      {/* Left: playlists and their settings */}
      <section className="sk-raised p-3 space-y-3 min-w-0">
        <h2 className="text-br-gold text-sm">Playlists</h2>
        <ul className="max-h-56 overflow-y-auto divide-y divide-br-dk-border border border-br-dk-border" role="listbox" aria-label="Playlists">
          {genres.map(g => {
            const w = cfg.rules.filter(r => !r.quiet && r.fillers.includes(g))
            return (
              <li key={g}>
                <button type="button" role="option" aria-selected={sel === g} onClick={() => setSel(g)} style={on(sel === g)}
                        className="w-full text-left px-3 py-2 flex items-baseline gap-3">
                  <span aria-hidden className="w-2.5 h-2.5 shrink-0 self-center" style={{ background: `hsl(${hue(g)} 55% 50%)` }} />
                  <span className="text-sm truncate">{g}</span>
                  <span className="text-sm text-br-dk-muted ml-auto shrink-0 truncate max-w-[55%]">{w.length ? windowText(w[0]) + (w.length > 1 ? ` +${w.length - 1}` : '') : cfg.defaultFillers.includes(g) ? 'Fallback' : 'Not scheduled'}</span>
                </button>
              </li>
            )
          })}
          <li>
            <button type="button" role="option" aria-selected={sel === QUIET} onClick={() => setSel(QUIET)} style={on(sel === QUIET)} className="w-full text-left px-3 py-2 flex items-baseline gap-3">
              <span aria-hidden className="w-2.5 h-2.5 shrink-0 self-center border border-br-dk-sub" />
              <span className="text-sm">Quiet hours</span>
              <span className="text-sm text-br-dk-muted ml-auto">{cfg.rules.filter(r => r.quiet).length || 'None'}</span>
            </button>
          </li>
        </ul>
        <div className="flex gap-2">
          <input className={`${box} flex-1 min-w-0`} value={newName} onChange={e => setNewName(e.target.value)} placeholder="New playlist name"
                 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlaylist() } }} />
          <button type="button" className="sk-key px-3 py-1.5 text-sm" onClick={addPlaylist}>Add</button>
        </div>

        <div className="border-t border-br-dk-border pt-3 space-y-3">
          <h3 className="text-br-dk-text text-base font-semibold">{sel === QUIET ? 'Quiet hours' : sel}</h3>
          {sel === QUIET && <p className="text-sm text-br-dk-sub">Nothing is scheduled; the AzuraCast default plays.</p>}
          {rulesFor.length === 0 && <p className="text-sm text-br-dk-sub">{sel === QUIET ? 'No quiet hours.' : 'Not in any time block yet.'}</p>}
          {rulesFor.map(r => <div key={r.id}>{renderRule(r)}</div>)}
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className="sk-key px-3 py-1.5 text-sm"
                    onClick={() => update({ rules: [...cfg.rules, sel === QUIET ? newRule({ name: 'Quiet hours', quiet: true, start: '04:00', end: '07:00', days: [0, 1, 2, 3, 4, 5, 6], priority: 30 }) : newRule({ name: sel, fillers: [sel] })] })}>
              {sel === QUIET ? 'Add quiet hours' : 'Add a time'}
            </button>
            {sel !== QUIET && cfg.rules.some(r => !r.quiet && !r.fillers.includes(sel)) && (
              <select className={box} value="" aria-label="Add to an existing block" onChange={e => { const r = cfg.rules.find(x => x.id === e.target.value); if (r) withGenre(r, sel) }}>
                <option value="">Add to a block…</option>
                {cfg.rules.filter(r => !r.quiet && !r.fillers.includes(sel)).map(r => <option key={r.id} value={r.id}>{r.name} ({windowText(r)})</option>)}
              </select>
            )}
          </div>
          {sel !== QUIET && (
            <div className="border border-br-dk-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-br-dk-text mr-auto">How often it plays</span>
                <button type="button" className="sk-key px-3 py-1 text-sm" style={on(manual === undefined)} aria-pressed={manual === undefined} onClick={() => setManual(undefined)}>Auto</button>
                <button type="button" className="sk-key px-3 py-1 text-sm" style={on(manual !== undefined)} aria-pressed={manual !== undefined} onClick={() => setManual(manual ?? stat?.weight ?? 1)}>Manual</button>
              </div>
              {manual === undefined ? (
                <div className="text-sm space-y-1">
                  <p className="text-br-dk-text tabular-nums">{(cfg.learn && stat ? stat.weight : 1).toFixed(2)}× average {!cfg.learn && <span className="text-br-dk-muted">(learning is off)</span>}</p>
                  {cfg.learn && stat && stat.samples > 0 ? (
                    <ul className="grid grid-cols-2 gap-x-4 text-br-dk-sub tabular-nums">
                      {DAYPARTS.map(d => <li key={d.id} className="flex justify-between"><span>{d.label}</span><span>{stat.parts[d.id].toFixed(2)}×</span></li>)}
                    </ul>
                  ) : cfg.learn ? <p className="text-br-dk-muted">No listener data yet, so it counts as average.</p> : null}
                  <p className="text-br-dk-muted">From listener counts, ratings and reactions, by time of day.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={3} step={0.05} value={manual} onChange={e => setManual(Number(e.target.value))} className="flex-1" aria-label="Frequency" />
                    <input type="number" min={0} max={3} step={0.05} value={manual} onChange={e => setManual(Number(e.target.value))} className={`${box} w-20`} aria-label="Frequency value" />
                  </div>
                  <p className="text-sm text-br-dk-muted">1 = average, 2 = twice as often, 0 = avoid. Replaces the automatic value at all hours.</p>
                </div>
              )}
            </div>
          )}
          {sel !== QUIET && (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 text-br-dk-text">
                <input type="checkbox" checked={cfg.defaultFillers.includes(sel)}
                       onChange={e => update({ defaultFillers: e.target.checked ? [...cfg.defaultFillers, sel] : cfg.defaultFillers.filter(x => x !== sel) })} />
                Fallback when no block applies
              </label>
              <button type="button" className="text-br-dk-sub hover:text-br-red" onClick={() => { if (window.confirm(`Remove ${sel} everywhere?`)) removePlaylist(sel) }}>Remove playlist</button>
            </div>
          )}
        </div>
      </section>

      {/* Right: next 3 days */}
      <section className="sk-raised p-3 min-w-0 lg:sticky lg:top-20">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-br-gold text-sm">Next 3 days</h2>
          <span className="text-sm text-br-dk-muted">Preview of these settings. Grey = booked shows.</span>
        </div>
        <div className="grid grid-cols-[2.75rem_repeat(3,minmax(0,1fr))] text-sm text-br-dk-sub border-b border-br-dk-border">
          <span />
          {[0, 1, 2].map(d => (
            <span key={d} className="px-1 py-1 text-center">{new Date(dayStart + d * DAY_MS + 12 * HOUR_MS).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: cfg.timezone })}</span>
          ))}
        </div>
        <div ref={grid} className="overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-[2.75rem_repeat(3,minmax(0,1fr))] relative" style={{ height: 24 * PX }}>
            <div className="relative">
              {hours.filter(h => h > 0).map(h => (
                <span key={h} className="absolute right-1 text-sm text-br-dk-muted -translate-y-1/2" style={{ top: h * PX }}>{clock(`${h}:00`)}</span>
              ))}
            </div>
            {[0, 1, 2].map(d => {
              const ds = dayStart + d * DAY_MS
              return (
                <div key={d} className="relative border-l border-br-dk-border">
                  {hours.map(h => <div key={h} className="absolute left-0 right-0 border-t border-br-dk-border/60" style={{ top: h * PX }} />)}
                  {segs.map((s, i) => {
                    const a = Math.max(s.startMs, ds), b = Math.min(s.endMs, ds + DAY_MS)
                    if (b <= a) return null
                    const top = ((a - ds) / HOUR_MS) * PX, h = Math.max(((b - a) / HOUR_MS) * PX, 16)
                    const picked = !s.real && s.label === sel
                    const style: CSSProperties = s.real
                      ? { top, height: h, background: 'var(--br-surface2)', borderColor: 'var(--br-border2)' }
                      : { top, height: h, background: `hsl(${hue(s.label)} 55% 50% / ${picked ? .55 : .25})`, borderColor: picked ? 'var(--br-accent)' : `hsl(${hue(s.label)} 55% 50% / .6)`, borderWidth: picked ? 2 : 1 }
                    return (
                      <button key={i} type="button" disabled={s.real} onClick={() => genres.includes(s.label) && setSel(s.label)} title={`${s.label}`}
                              className="absolute left-0.5 right-0.5 border text-left text-sm leading-tight px-1 overflow-hidden text-br-dk-text disabled:cursor-default" style={style}>
                        {s.label}
                      </button>
                    )
                  })}
                  {d === 0 && <div aria-hidden className="absolute left-0 right-0 border-t-2 border-br-red" style={{ top: nowTop }} />}
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
