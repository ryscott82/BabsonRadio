'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { apiGet } from '@/lib/auth'
import { PARTS, QUIET, gridKey, localParts, mixOf, normalizeMix, planAutoBlocks, setShare, type AutoConfig, type Daypart, type Part } from '@/lib/autoschedule'

// Auto DJ settings. Normally nobody edits a schedule: each playlist has a number from 0 to 1 for five parts of the week
// (mornings, afternoons, evenings, weeknights, weekend nights) saying how often it plays, and the Auto DJ fills the schedule from those.
// Below, a weekly grid lets staff pin a playlist (or silence) to specific hours; that is rarely needed.
// Right: the next 3 days, redrawn as you edit. Real shows and booked slots are grey and the Auto DJ works around them.

interface Item { id: string; source: string; title: string; startAt: number; endAt: number }
interface Stat { label: string; weight: number; samples: number; parts: Record<Daypart, number> }
interface Seg { startMs: number; endMs: number; label: string; real: boolean }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GRID_DAYS = [1, 2, 3, 4, 5, 6, 0] // Monday first
const PX = 28            // pixels per hour on the preview
const CELL = 18          // pixels per hour on the hand-set grid
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const on = (b: boolean): CSSProperties | undefined => (b ? { borderColor: 'var(--br-accent)', color: 'var(--br-accent)', background: 'var(--br-surface2)' } : undefined)

function clock(s: string) {
  const [h, m] = s.split(':').map(Number)
  if (Number.isNaN(h)) return s
  const hh = h % 24
  const t = `${hh % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}`
  return `${t}${hh < 12 || h === 24 ? 'a' : 'p'}`
}

// A stable color per playlist name.
function hue(label: string) { let h = 0; for (const c of label) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

export default function AutoPlanner({ cfg, update }: { cfg: AutoConfig; update: (p: Partial<AutoConfig>) => void }) {
  const lists = cfg.playlists ?? []
  const genres = lists.map(p => p.name)
  const isOff = (g: string) => lists.some(p => p.name === g && p.enabled === false)
  const [newName, setNewName] = useState('')
  const [brush, setBrush] = useState<string>(genres[0] ?? QUIET) // '' = back to automatic
  const [items, setItems] = useState<Item[]>([])
  const [now] = useState(() => Date.now())
  const [stats, setStats] = useState<Stat[]>([])
  const preview = useRef<HTMLDivElement | null>(null)
  const painter = useRef<HTMLDivElement | null>(null)
  const painting = useRef(false)
  const gridNow = useRef(cfg.grid ?? {})
  useEffect(() => { gridNow.current = cfg.grid ?? {} }, [cfg.grid])

  useEffect(() => { apiGet<{ items: Item[] }>('/api/schedule?days=4').then(r => setItems(r.items)).catch(() => {}) }, [])
  useEffect(() => { apiGet<{ stats: Stat[] }>('/api/admin/insights').then(r => setStats(r.stats)).catch(() => {}) }, [])
  useEffect(() => { preview.current?.scrollTo({ top: Math.max(0, (new Date().getHours() - 1) * PX) }) }, [])
  useEffect(() => {
    const stop = () => { painting.current = false }
    window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop)
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop) }
  }, [])

  const box = 'sk-field px-2 py-1.5 text-sm text-br-dk-text'

  // ── Playlists and their numbers ──
  // Each part's shares always add up to 1: moving one slider rescales the others.
  const setMix = (g: string, part: Part, v: number) => update({ mix: setShare(cfg, g, part, v) })
  /** Take a playlist out of the Auto DJ for good (the playlist in AzuraCast is not touched). Hours set to it by hand go too. */
  function removePlaylist(g: string) {
    const left = lists.filter(p => p.name !== g)
    update({
      playlists: left, mix: normalizeMix(cfg.mix, left),
      grid: Object.fromEntries(Object.entries(cfg.grid ?? {}).filter(([, v]) => v !== g)),
      rules: cfg.rules.map(r => ({ ...r, fillers: r.fillers.filter(x => x !== g) })).filter(r => r.quiet || r.fillers.length > 0),
      defaultFillers: cfg.defaultFillers.filter(x => x !== g),
    })
    if (brush === g) setBrush(genres.find(x => x !== g) ?? QUIET)
  }
  function addPlaylist() {
    const v = newName.trim()
    if (!v) return
    if (!genres.some(g => g.toLowerCase() === v.toLowerCase())) { const next = [...lists, { name: v }]; update({ playlists: next, mix: normalizeMix(cfg.mix, next), defaultFillers: [...cfg.defaultFillers, v] }) }
    setNewName('')
  }
  /** Skip a playlist for now: it keeps its numbers, the others fill in, and AzuraCast stops playing it. */
  const setExcluded = (g: string, off: boolean) => update({ playlists: lists.map(p => (p.name === g ? (off ? { name: g, enabled: false } : { name: g }) : p)) })

  // ── Hours set by hand ──
  function paint(dow: number, hour: number) {
    const k = gridKey(dow, hour)
    const cur = gridNow.current
    if ((brush === '' && !(k in cur)) || cur[k] === brush) return
    const next = { ...cur }
    if (brush === '') delete next[k]; else next[k] = brush
    gridNow.current = next
    update({ grid: next })
  }
  function cellAt(e: RPointerEvent) {
    const r = painter.current?.getBoundingClientRect()
    if (!r) return null
    const x = e.clientX - r.left, y = e.clientY - r.top
    const col = Math.floor(x / (r.width / 7)), row = Math.floor(y / CELL)
    return col >= 0 && col < 7 && row >= 0 && row < 24 ? { dow: GRID_DAYS[col], hour: row } : null
  }
  const handCount = Object.keys(cfg.grid ?? {}).length

  // ── The preview: three days from the start of today in station time ──
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

  const hours = Array.from({ length: 24 }, (_, h) => h)
  const nowTop = ((now - dayStart) / HOUR_MS) * PX

  return (
    <div className="grid lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        {/* How often each playlist plays */}
        <section className="sk-raised p-3 space-y-3">
          <h2 className="text-br-gold text-sm">How often each playlist plays</h2>
          <p className="text-sm text-br-dk-sub">
            For each part of the week, the playlists share 1.00 between them. Slide one up and the others shrink to make room, so a 0.60 plays about twice as often as a 0.30, and 0 means never in that part. You should not need to touch the schedule itself.
          </p>
          <ul className="space-y-3">
            {genres.map(g => (
              <li key={g} className="border border-br-dk-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="w-2.5 h-2.5 shrink-0" style={{ background: `hsl(${hue(g)} 55% 50%)` }} />
                  <h3 className={`text-base font-semibold text-br-dk-text truncate ${isOff(g) ? 'line-through opacity-60' : ''}`}>{g}</h3>
                  {isOff(g) && <span className="text-sm text-br-dk-muted">Left out for now</span>}
                </div>
                <div className={`space-y-1 ${isOff(g) ? 'opacity-50' : ''}`}>
                  {PARTS.map(p => {
                    const v = mixOf(cfg, g, p.id)
                    return (
                      <label key={p.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 min-h-9">
                        <span className="text-sm text-br-dk-sub leading-tight">{p.label}<span className="block text-xs text-br-dk-muted">{p.when}</span></span>
                        <input type="range" min={0} max={1} step={0.05} value={v} aria-label={`${g}, ${p.label}`} onChange={e => setMix(g, p.id, Number(e.target.value))} />
                        <span className="text-sm text-br-dk-text text-right tabular-nums">{v === 0 ? 'Never' : v.toFixed(2)}</span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm pt-1">
                  <label className="flex items-center gap-2 text-br-dk-text min-h-9">
                    <input type="checkbox" className="w-4 h-4" checked={isOff(g)} onChange={e => setExcluded(g, e.target.checked)} />
                    Leave out for now
                  </label>
                  <button type="button" className="text-br-dk-sub hover:text-br-red" onClick={() => { if (window.confirm(`Remove ${g} from the Auto DJ? The playlist in AzuraCast is not deleted. To keep it for later, use "Leave out for now" instead.`)) removePlaylist(g) }}>Remove</button>
                </div>
              </li>
            ))}
            {genres.length === 0 && <li className="text-sm text-br-dk-sub">No playlists yet. Add one below (the name must match an AzuraCast playlist).</li>}
          </ul>
          <div className="flex gap-2">
            <input className={`${box} flex-1 min-w-0`} value={newName} onChange={e => setNewName(e.target.value)} placeholder="New playlist name"
                   onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlaylist() } }} />
            <button type="button" className="sk-key px-3 py-1.5 text-sm" onClick={addPlaylist}>Add</button>
          </div>
          <p className="text-sm text-br-dk-muted">A new playlist gets an equal share everywhere, and the others shrink to make room. A playlist you leave out keeps its share on screen, and the others fill in for it when the schedule is built.</p>
        </section>

        {/* Hours set by hand */}
        <details className="sk-raised p-3" open={handCount > 0}>
          <summary className="cursor-pointer select-none text-br-gold text-sm min-h-9">Set hours by hand (rarely needed){handCount > 0 ? ` · ${handCount} set` : ''}</summary>
          <div className="pt-3 space-y-3">
            <p className="text-sm text-br-dk-sub">Pick a playlist, then click or drag over hours. Those hours always play that playlist; everything else follows the numbers above. &ldquo;Quiet&rdquo; schedules nothing (AzuraCast&rsquo;s default plays). &ldquo;Automatic&rdquo; puts an hour back.</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Brush">
              {genres.map(g => (
                <button key={g} type="button" aria-pressed={brush === g} onClick={() => setBrush(g)} style={on(brush === g)} className="sk-key px-2.5 py-1 text-sm inline-flex items-center gap-2">
                  <span aria-hidden className="w-2.5 h-2.5" style={{ background: `hsl(${hue(g)} 55% 50%)` }} />{g}
                </button>
              ))}
              <button type="button" aria-pressed={brush === QUIET} onClick={() => setBrush(QUIET)} style={on(brush === QUIET)} className="sk-key px-2.5 py-1 text-sm">Quiet</button>
              <button type="button" aria-pressed={brush === ''} onClick={() => setBrush('')} style={on(brush === '')} className="sk-key px-2.5 py-1 text-sm">Automatic</button>
            </div>
            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] text-sm">
              <span />
              <div className="grid grid-cols-7 text-center text-br-dk-sub border-b border-br-dk-border">{GRID_DAYS.map(d => <span key={d} className="py-1">{DAY_NAMES[d]}</span>)}</div>
              <div className="relative" style={{ height: 24 * CELL }}>
                {hours.filter(h => h % 3 === 0).map(h => <span key={h} className="absolute right-1 text-xs text-br-dk-muted -translate-y-1/2" style={{ top: h * CELL + (h === 0 ? 6 : 0) }}>{clock(`${h}:00`)}</span>)}
              </div>
              <div ref={painter} className="grid grid-cols-7 select-none border-l border-br-dk-border" style={{ touchAction: 'none' }}
                   onPointerDown={e => { const c = cellAt(e); if (!c) return; painting.current = true; paint(c.dow, c.hour) }}
                   onPointerMove={e => { if (!painting.current) return; const c = cellAt(e); if (c) paint(c.dow, c.hour) }}>
                {GRID_DAYS.map(d => (
                  <div key={d} className="border-r border-br-dk-border/60">
                    {hours.map(h => {
                      const v = (cfg.grid ?? {})[gridKey(d, h)]
                      const style: CSSProperties = { height: CELL }
                      if (v === QUIET) style.background = 'repeating-linear-gradient(45deg, var(--br-surface2), var(--br-surface2) 3px, transparent 3px, transparent 6px)'
                      else if (v) style.background = `hsl(${hue(v)} 55% 50% / .6)`
                      return <div key={h} className="border-b border-br-dk-border/40" style={style} title={`${DAY_NAMES[d]} ${clock(`${h}:00`)}: ${v === QUIET ? 'Quiet' : v ?? 'Automatic'}`} />
                    })}
                  </div>
                ))}
              </div>
            </div>
            {handCount > 0 && <button type="button" className="text-sm text-br-dk-sub hover:text-br-red" onClick={() => { gridNow.current = {}; update({ grid: {} }) }}>Put every hour back to automatic</button>}
          </div>
        </details>

        {/* Blocks from the old schedule editor, still in effect until removed */}
        {cfg.rules.length > 0 && (
          <section className="sk-raised p-3 space-y-2">
            <h2 className="text-br-gold text-sm">Older custom blocks</h2>
            <p className="text-sm text-br-dk-sub">These came from the old schedule editor and still win over the numbers above. Remove them to let the numbers decide.</p>
            <ul className="divide-y divide-br-dk-border border border-br-dk-border">
              {cfg.rules.map(r => (
                <li key={r.id} className="px-3 py-2 flex items-baseline gap-3 text-sm">
                  <span className="text-br-dk-text truncate">{r.name}</span>
                  <span className="text-br-dk-muted truncate">{r.quiet ? 'Quiet' : r.fillers.join(', ')} · {r.days.length === 7 ? 'every day' : r.days.map(d => DAY_NAMES[d]).join(' ')} {clock(r.start)}–{clock(r.end)}{r.enabled === false ? ' · off' : ''}</span>
                  <button type="button" className="ml-auto shrink-0 text-br-dk-sub hover:text-br-red" onClick={() => update({ rules: cfg.rules.filter(x => x.id !== r.id) })}>Remove</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

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
        <div ref={preview} className="overflow-y-auto max-h-[70vh]">
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
                    const style: CSSProperties = s.real
                      ? { top, height: h, background: 'var(--br-surface2)', borderColor: 'var(--br-border2)' }
                      : { top, height: h, background: `hsl(${hue(s.label)} 55% 50% / .3)`, borderColor: `hsl(${hue(s.label)} 55% 50% / .6)` }
                    return (
                      <div key={i} title={s.label} className="absolute left-0.5 right-0.5 border text-left text-sm leading-tight px-1 overflow-hidden text-br-dk-text" style={style}>{s.label}</div>
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
