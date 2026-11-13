'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { METER_CELLS, cellZone, cellsLit, levelAdvice, levelWord, type CellZone, type LevelState, type Tone } from '@/lib/booth'
import type { MeterFrame, MeterStats } from './useInputMeter'

// Level read-out: what goes to the station (the mixer input plus BUTT's gain) as a segmented bar of small lit cells, like the equalizer.
// One shade each: green at the bottom, yellow near the top (the sweet spot), red at the very top (clipping or sustained loudness).
// Too quiet is the bar sitting low in green, with a line saying what to do. Dead air takes it over.

const GREEN = '#1FBF7F', YELLOW = '#F2C94C', RED = '#FF4B3A'
const ZONE_COLOR: Record<CellZone, string> = { green: GREEN, yellow: YELLOW, red: RED }
const TONE_COLOR: Record<Tone, string | undefined> = { ok: GREEN, caution: YELLOW, warn: RED, off: undefined }
const TIP: Record<LevelState, string> = {
  off: 'Tap anywhere to start it.',
  silent: 'Check the mics and the mixer.',
  quiet: '',
  good: 'Right where it should be.',
  near: 'Nice and strong. Keep it here.',
  loud: '',
}
const PEAK_HOLD_MS = 1500

export interface AutoLevel { available: boolean; on: boolean; db: number; error: string; toggle: () => void }

export default function LevelMeter({ frame, stats, error, deadAir, auto, staff = false }: {
  frame: RefObject<MeterFrame>; stats: MeterStats; error: string; deadAir: number; auto: AutoLevel
  /** Admins and the E-board see a short note when Auto level is not set up; nobody else sees anything about it. */
  staff?: boolean
}) {
  const gain = auto.on ? auto.db : 0
  const state: LevelState = stats.state // already includes BUTT's gain (see useInputMeter)
  const { word, tone } = levelWord(state)
  const color = deadAir > 0 ? RED : TONE_COLOR[tone]
  const adv = levelAdvice(stats.mid, state)
  const action = adv.dir === 'up' ? `▲ Turn the mixer up ${adv.amount}` : adv.dir === 'down' ? (adv.amount === 'now' ? '▼ Turn it down now' : `▼ Turn the mixer down ${adv.amount}`) : ''
  const autoNote = auto.on && Math.abs(auto.db) >= 3 ? `Auto level is ${auto.db > 0 ? 'adding' : 'cutting'} ${Math.abs(Math.round(auto.db))} dB to make up for it.` : ''
  const tip = error || (deadAir > 0 ? `${deadAir} seconds of silence on air.` : TIP[state] || autoNote)
  return (
    <div className="bp h-full flex flex-col px-5 py-3 min-h-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="hw-title text-2xl leading-tight">Loudness meter</p>
        <p className="num leading-none" style={{ fontSize: 'clamp(1.5rem, 2.4vw, 2.75rem)', color }}>{deadAir > 0 ? 'Dead air' : word}</p>
      </div>
      <Bar frame={frame} gain={gain} />
      <div className="flex items-baseline justify-between gap-4 mt-1.5 min-h-[1.75rem]">
        <p className="lbl text-lg" style={error || deadAir > 0 || state === 'silent' ? { color: RED } : undefined}>{tip}</p>
        <p className="text-2xl shrink-0" style={{ color }} aria-live="polite">{action}</p>
      </div>
      {/* Auto level appears by itself once the helper reports the MIDI add-on is ready; until then students see nothing. */}
      {auto.available ? (
        <div className="mt-auto pt-2 border-t rule flex flex-wrap items-center gap-3">
          <button type="button" className="gbtn h-10 px-4 text-base" aria-pressed={auto.on} onClick={auto.toggle}>Auto level {auto.on ? 'on' : 'off'}</button>
          <span className="lbl text-base">{auto.on ? `BUTT gain ${auto.db > 0 ? '+' : ''}${auto.db.toFixed(1)} dB` : 'Set the level with the mixer.'}</span>
        </div>
      ) : staff ? <p className="mt-auto pt-2 lbl text-base">Auto level isn’t set up.</p> : null}
    </div>
  )
}

/** The gauge: small cells lit from the bottom for the loudness of the last 10 s, plus one brighter cell that holds the latest peak for a moment.
 *  Redrawn every frame by changing opacity only. */
export function Bar({ frame, gain }: { frame: RefObject<MeterFrame>; gain: number }) {
  const cells = useRef<(HTMLDivElement | null)[]>([])
  const g = useRef(gain)
  useEffect(() => { g.current = gain }, [gain])
  useEffect(() => {
    let raf = 0, peak = 0, peakAt = 0
    const draw = () => {
      const f = frame.current, now = performance.now()
      const lvl = Number.isFinite(f.long) ? f.long : f.short
      const lit = cellsLit(Number.isFinite(lvl) ? lvl + g.current : -Infinity)
      const mom = cellsLit(Number.isFinite(f.momentary) ? f.momentary + g.current : -Infinity)
      if (mom >= peak || now - peakAt > PEAK_HOLD_MS) { peak = mom; peakAt = now }
      cells.current.forEach((el, i) => {
        if (!el) return
        const hold = i === peak - 1 && peak > lit
        el.style.opacity = i < lit ? '1' : hold ? '1' : '0.16'
        el.style.boxShadow = hold ? '0 0 0 2px rgba(244,239,226,.85)' : 'none'
      })
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frame])
  return (
    <div className="mt-2 flex items-end gap-[3px] h-10 rounded-lg px-2 py-1.5" style={{ background: 'rgba(244,239,226,.05)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.6)' }} role="img" aria-label="Level">
      {Array.from({ length: METER_CELLS }, (_, i) => (
        <div key={i} ref={el => { cells.current[i] = el }} className="flex-1 h-full rounded-[2px]" style={{ background: ZONE_COLOR[cellZone(i)], opacity: 0.16 }} />
      ))}
    </div>
  )
}
