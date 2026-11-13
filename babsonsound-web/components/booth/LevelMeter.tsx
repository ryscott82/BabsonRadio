'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { GOOD_LUFS, LOUD_LUFS, NEAR_LUFS, levelAdvice, levelWord, type LevelState, type Tone } from '@/lib/booth'
import type { MeterFrame, MeterStats } from './useInputMeter'

// Level read-out: what goes to the station (the mixer input plus BUTT's gain) on one gauge, one word, and what to do about it.
// Four colours, one shade each: blue = too quiet, green = good, yellow = getting loud, red = too loud (turn it down). Dead air takes it over.

const BLUE = '#4C8DFF', GREEN = '#1FBF7F', YELLOW = '#F2C94C', RED = '#FF4B3A'
const TONE_COLOR: Record<Tone, string | undefined> = { ok: GREEN, info: BLUE, caution: YELLOW, warn: RED, off: undefined }
const TIP: Record<LevelState, string> = {
  off: 'Tap anywhere to start it.',
  silent: 'Check the mics and the mixer.',
  quiet: '',
  good: 'Right where it should be.',
  near: 'Peaks are close to the top. Leave some room.',
  loud: '',
}
const MIN = -36
const pos = (l: number) => `${Math.max(0, Math.min(100, ((l - MIN) / -MIN) * 100))}%`
const x = (l: number) => Math.max(0, Math.min(100, ((l - MIN) / -MIN) * 100))

export interface AutoLevel { available: boolean; on: boolean; db: number; error: string; toggle: () => void }

export default function LevelMeter({ frame, stats, error, deadAir, auto }: {
  frame: RefObject<MeterFrame>; stats: MeterStats; error: string; deadAir: number; auto: AutoLevel
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
    <div className="bp h-full flex flex-col px-5 py-4 min-h-0">
      <p className="hw-title text-2xl leading-tight">Loudness meter</p>
      <p className="num mt-0.5 leading-none" style={{ fontSize: 'clamp(1.75rem, 2.8vw, 3.25rem)', color }}>{deadAir > 0 ? 'Dead air' : word}</p>
      <p className="text-2xl min-h-[2rem] mt-1" style={{ color }} aria-live="polite">{action}</p>
      <Bar frame={frame} gain={gain} color={color ?? GREEN} />
      <p className="lbl text-lg mt-1.5 min-h-[1.75rem]" style={error || deadAir > 0 || state === 'silent' ? { color: RED } : undefined}>{tip}</p>
      <div className="mt-auto pt-2 border-t rule flex flex-wrap items-center gap-3">
        <button type="button" className="gbtn h-10 px-4 text-base" aria-pressed={auto.on} disabled={!auto.available} onClick={auto.toggle}>
          Auto level {auto.on ? 'on' : 'off'}
        </button>
        <span className="lbl text-base">
          {!auto.available ? (auto.error || 'Not set up on this PC.') : auto.on ? `BUTT gain ${auto.db > 0 ? '+' : ''}${auto.db.toFixed(1)} dB` : 'Set the level with the mixer.'}
        </span>
      </div>
    </div>
  )
}

/** The gauge: faint zones behind (blue, green, yellow, red), a bar for the loudness of the last 10 s in the colour of what the word says,
 *  and a tick for this instant. Redrawn every frame. */
export function Bar({ frame, gain, color }: { frame: RefObject<MeterFrame>; gain: number; color: string }) {
  const fill = useRef<HTMLDivElement>(null), tick = useRef<HTMLDivElement>(null)
  const g = useRef(gain), c = useRef(color)
  useEffect(() => { g.current = gain; c.current = color }, [gain, color])
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const f = frame.current
      const lvl = Number.isFinite(f.long) ? f.long : f.short
      const st = Number.isFinite(lvl) ? lvl + g.current : MIN, mo = Number.isFinite(f.momentary) ? f.momentary + g.current : MIN
      if (fill.current) { fill.current.style.width = pos(st); fill.current.style.background = c.current }
      if (tick.current) tick.current.style.left = pos(mo)
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frame])
  const zone = (a: number, b: number, col: string) => <div className="absolute inset-y-0" style={{ left: `${x(a)}%`, width: `${x(b) - x(a)}%`, background: col, opacity: 0.22 }} />
  return (
    <div className="mt-2">
      <div className="relative h-11 rounded-lg overflow-hidden" style={{ background: 'rgba(244,239,226,.06)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.6)' }}>
        {zone(MIN, GOOD_LUFS[0], BLUE)}{zone(GOOD_LUFS[0], NEAR_LUFS, GREEN)}{zone(NEAR_LUFS, LOUD_LUFS, YELLOW)}{zone(LOUD_LUFS, 0, RED)}
        <div ref={fill} className="absolute left-0 top-3.5 bottom-3.5 rounded-r" style={{ transition: 'width 250ms ease-out' }} />
        <div ref={tick} className="absolute inset-y-1.5 w-1 -ml-0.5 rounded" style={{ background: 'rgba(244,239,226,.9)' }} />
      </div>
    </div>
  )
}
