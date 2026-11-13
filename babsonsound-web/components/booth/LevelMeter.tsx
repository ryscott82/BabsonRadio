'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { GOOD_LUFS, LOUD_LUFS, QUIET_LUFS, TARGET_LUFS, levelAdvice, levelWord, type LevelState, type Tone } from '@/lib/booth'
import type { MeterFrame, MeterStats } from './useInputMeter'

// Level read-out: what goes to the station (the mixer input plus BUTT's gain) on one gauge with the zones drawn on it, one word that always
// agrees with the gauge, what to do about it ("Turn up a little"), and the last two minutes. Dead air takes it over.

const TIP: Record<LevelState, string> = {
  off: 'Tap anywhere to start it.',
  silent: 'Check the mics and the mixer.',
  quiet: '', good: '', loud: '', clip: 'It’s distorting.',
}
const MIN = -36
const pos = (l: number) => `${Math.max(0, Math.min(100, ((l - MIN) / -MIN) * 100))}%`
const x = (l: number) => Math.max(0, Math.min(100, ((l - MIN) / -MIN) * 100))
const INFO = '#5AA2FF', OK = '#1FBF7F', WARN = '#FF6A55', AMBER = '#F2B64A'
const TONE_CLASS: Record<Tone, string> = { ok: 'ok', warn: 'warn', info: '', off: '' }
/** Colour of the bar for a loudness: blue when low, green when good, amber when hot, red when too loud. */
const colorOf = (l: number) => (l < QUIET_LUFS ? INFO : l < GOOD_LUFS[0] ? '#7FB6FF' : l <= GOOD_LUFS[1] ? OK : l <= LOUD_LUFS ? AMBER : WARN)

export interface AutoLevel { available: boolean; on: boolean; db: number; error: string; toggle: () => void }

export default function LevelMeter({ frame, stats, error, deadAir, auto }: {
  frame: RefObject<MeterFrame>; stats: MeterStats; error: string; deadAir: number; auto: AutoLevel
}) {
  const gain = auto.on ? auto.db : 0
  const state: LevelState = stats.state // already includes BUTT's gain (see useInputMeter)
  const { word, tone } = levelWord(state, stats.mid)
  const adv = levelAdvice(stats.mid, state)
  const bad = deadAir > 0 || tone === 'warn'
  const arrow = adv.dir === 'up' ? '▲' : adv.dir === 'down' ? '▼' : ''
  const action = adv.dir === 'ok' ? '' : adv.dir === 'up' ? `Turn the mixer up ${adv.amount}` : adv.amount === 'now' ? 'Turn it down now' : `Turn the mixer down ${adv.amount}`
  const autoNote = auto.on && Math.abs(auto.db) >= 3 ? `Auto level is ${auto.db > 0 ? 'adding' : 'cutting'} ${Math.abs(Math.round(auto.db))} dB to make up for it.` : ''
  const tip = error || (deadAir > 0 ? `${deadAir} seconds of silence on air.` : TIP[state] || (adv.dir === 'ok' ? 'Right on target.' : autoNote))
  return (
    <div className="bp h-full flex flex-col px-6 py-5 min-h-0">
      <p className="hw-title text-3xl leading-tight">Loudness meter</p>
      <p className={`num mt-1 ${bad ? 'warn' : TONE_CLASS[tone]}`} style={{ fontSize: 'clamp(2.5rem, 4.4vw, 5.5rem)', color: !bad && tone === 'info' ? INFO : undefined }}>{deadAir > 0 ? 'Dead air' : word}</p>
      <p className="text-3xl min-h-[2.25rem] mt-1" style={{ color: adv.dir === 'up' ? INFO : adv.dir === 'down' ? WARN : undefined }} aria-live="polite">
        {action ? `${arrow} ${action}` : ''}
      </p>
      <Bar frame={frame} gain={gain} />
      <History frame={frame} gain={gain} />
      <p className={`text-xl mt-2 ${bad ? 'warn' : 'lbl'}`}>{tip}</p>
      <div className="mt-auto pt-3 border-t rule flex flex-wrap items-center gap-3">
        <button type="button" className="gbtn h-11 px-5 text-lg" aria-pressed={auto.on} disabled={!auto.available} onClick={auto.toggle}>
          Auto level {auto.on ? 'on' : 'off'}
        </button>
        <span className="lbl text-lg">
          {!auto.available ? (auto.error || 'Not set up on this PC.') : auto.on ? `BUTT gain ${auto.db > 0 ? '+' : ''}${auto.db.toFixed(1)} dB` : 'Set the level with the mixer.'}
        </span>
      </div>
    </div>
  )
}

/** The gauge: coloured zones behind (too quiet, a bit low, good, a bit loud, too loud), a bar for the loudness of the last 10 s that takes the
 *  colour of the zone it is in, a tick for what is happening this instant, and the target line. Redrawn every frame. */
export function Bar({ frame, gain, compact = false }: { frame: RefObject<MeterFrame>; gain: number; compact?: boolean }) {
  const fill = useRef<HTMLDivElement>(null), tick = useRef<HTMLDivElement>(null)
  const g = useRef(gain)
  useEffect(() => { g.current = gain }, [gain])
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const f = frame.current
      const lvl = Number.isFinite(f.long) ? f.long : f.short
      const st = Number.isFinite(lvl) ? lvl + g.current : MIN, mo = Number.isFinite(f.momentary) ? f.momentary + g.current : MIN
      const clip = Date.now() - f.clipAt < 2000
      if (fill.current) { fill.current.style.width = pos(st); fill.current.style.background = clip ? WARN : colorOf(st) }
      if (tick.current) tick.current.style.left = pos(mo)
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frame])
  const zone = (a: number, b: number, color: string, op: number) => (
    <div className="absolute inset-y-0" style={{ left: `${x(a)}%`, width: `${x(b) - x(a)}%`, background: color, opacity: op }} />
  )
  return (
    <div className={compact ? '' : 'mt-2'}>
      <div className={`relative ${compact ? 'h-7 rounded-lg' : 'h-20 rounded-xl'} overflow-hidden`} style={{ background: 'rgba(244,239,226,.06)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.6)' }}>
        {zone(MIN, QUIET_LUFS, INFO, 0.2)}{zone(QUIET_LUFS, GOOD_LUFS[0], INFO, 0.1)}
        {zone(GOOD_LUFS[0], GOOD_LUFS[1], OK, 0.3)}
        {zone(GOOD_LUFS[1], LOUD_LUFS, AMBER, 0.2)}{zone(LOUD_LUFS, 0, WARN, 0.3)}
        <div ref={fill} className="absolute left-0 top-5 bottom-5 rounded-r" style={{ transition: 'width 250ms ease-out' }} />
        <div ref={tick} className="absolute inset-y-2 w-1.5 -ml-0.5 rounded" style={{ background: 'rgba(244,239,226,.9)' }} />
        <div className="absolute inset-y-0 w-0.5" style={{ left: pos(TARGET_LUFS), background: 'rgba(244,239,226,.75)' }} />
      </div>
      {!compact && (
        <div className="lbl relative h-7 text-lg mt-1">
          <span className="absolute" style={{ left: pos((MIN + QUIET_LUFS) / 2), transform: 'translateX(-50%)' }}>Too quiet</span>
          <span className="absolute" style={{ left: pos(TARGET_LUFS), transform: 'translateX(-50%)' }}>Good</span>
          <span className="absolute" style={{ left: pos(LOUD_LUFS / 2), transform: 'translateX(-50%)' }}>Too loud</span>
        </div>
      )}
    </div>
  )
}

/** The last two minutes of loudness on the same scale, so a host can see it drifting before it becomes a problem. */
function History({ frame, gain }: { frame: RefObject<MeterFrame>; gain: number }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const g = useRef(gain)
  useEffect(() => { g.current = gain }, [gain])
  useEffect(() => {
    const draw = () => {
      const c = cv.current, h = frame.current.history
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      const W = c.width, H = c.height
      ctx.clearRect(0, 0, W, H)
      const y = (l: number) => H - ((Math.max(MIN, Math.min(0, l)) - MIN) / -MIN) * H
      const band = (a: number, b: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(0, y(b), W, y(a) - y(b)) }
      band(MIN, QUIET_LUFS, 'rgba(90,162,255,.14)'); band(GOOD_LUFS[0], GOOD_LUFS[1], 'rgba(31,191,127,.22)'); band(LOUD_LUFS, 0, 'rgba(255,106,85,.2)')
      const n = 240, dx = W / n
      ctx.lineWidth = 2.5; ctx.lineJoin = 'round'
      let prev: { x: number; y: number; l: number } | null = null
      h.forEach((v, i) => {
        if (!Number.isFinite(v)) { prev = null; return }
        const l = v + g.current, px = (n - h.length + i) * dx, py = y(l)
        if (prev) { ctx.strokeStyle = colorOf(l); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(px, py); ctx.stroke() }
        prev = { x: px, y: py, l }
      })
    }
    draw()
    const t = setInterval(draw, 500)
    return () => clearInterval(t)
  }, [frame])
  return (
    <div className="mt-3">
      <canvas ref={cv} width={480} height={64} className="w-full h-14 rounded-lg" style={{ background: 'rgba(244,239,226,.05)' }} aria-label="Loudness over the last two minutes" role="img" />
      <div className="lbl flex justify-between text-base mt-0.5"><span>2 min ago</span><span>Now</span></div>
    </div>
  )
}
