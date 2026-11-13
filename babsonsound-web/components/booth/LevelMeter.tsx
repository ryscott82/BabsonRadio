'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { GOOD_LUFS, LOUD_LUFS, TARGET_LUFS, type LevelState } from '@/lib/booth'
import type { MeterFrame, MeterStats } from './useInputMeter'

// Level read-out: what goes to the station (the mixer input plus BUTT's gain), one big bar against the target, what to do,
// and the Auto level switch. Dead air takes it over.

const WORD: Record<LevelState, string> = { off: 'Meter off', silent: 'No sound', quiet: 'Too quiet', good: 'Good', loud: 'Too loud', clip: 'Too loud' }
const TIP: Record<LevelState, string> = {
  off: 'Tap anywhere to start it.',
  silent: 'Check the mics and the mixer.',
  quiet: 'Turn the mixer up a little.',
  good: 'Right on target.',
  loud: 'Turn the mixer down a little.',
  clip: 'Turn down now. It’s distorting.',
}
const pos = (l: number) => `${Math.max(0, Math.min(100, ((l + 36) / 36) * 100))}%`

export interface AutoLevel { available: boolean; on: boolean; db: number; error: string; toggle: () => void }

export default function LevelMeter({ frame, stats, error, deadAir, auto }: {
  frame: RefObject<MeterFrame>; stats: MeterStats; error: string; deadAir: number; auto: AutoLevel
}) {
  const gain = auto.on ? auto.db : 0
  const state: LevelState = stats.state // already includes BUTT's gain (see useInputMeter)
  const bad = deadAir > 0 || state === 'clip' || state === 'loud' || state === 'silent'
  const tip = error || (deadAir > 0 ? `${deadAir} seconds of silence on air.` : auto.on && (state === 'quiet' || state === 'loud') ? 'Auto level is adjusting.' : TIP[state])
  return (
    <div className="bp h-full flex flex-col px-6 py-5 min-h-0">
      <p className="hw-title text-3xl leading-tight">Level</p>
      <p className={`num mt-1 ${bad ? 'warn' : state === 'good' ? 'ok' : ''}`} style={{ fontSize: 'clamp(2.5rem, 3.6vw, 4.5rem)' }}>{deadAir > 0 ? 'Dead air' : WORD[state]}</p>
      <Bar frame={frame} gain={gain} />
      <p className={`text-xl mt-2 ${bad ? 'warn' : 'lbl'}`}>{tip}</p>
      <div className="mt-auto pt-3 border-t rule flex flex-col items-start gap-2">
        <button type="button" className="gbtn h-12 px-5 text-xl" aria-pressed={auto.on} disabled={!auto.available} onClick={auto.toggle}>
          Auto level {auto.on ? 'on' : 'off'}
        </button>
        <span className="lbl text-lg">
          {!auto.available ? (auto.error || 'Not set up on this PC.') : auto.on ? `BUTT gain ${auto.db > 0 ? '+' : ''}${auto.db.toFixed(1)} dB` : 'Set the level with the mixer.'}
        </span>
      </div>
    </div>
  )
}

/** Short-term loudness (bar) and momentary loudness (tick), with BUTT's gain added, redrawn every frame. */
export function Bar({ frame, gain, compact = false }: { frame: RefObject<MeterFrame>; gain: number; compact?: boolean }) {
  const fill = useRef<HTMLDivElement>(null), tick = useRef<HTMLDivElement>(null)
  const g = useRef(gain)
  useEffect(() => { g.current = gain }, [gain])
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const f = frame.current
      const st = Number.isFinite(f.short) ? f.short + g.current : -60, mo = Number.isFinite(f.momentary) ? f.momentary + g.current : -60
      const color = st > LOUD_LUFS || Date.now() - f.clipAt < 2000 ? '#FF6A55' : 'var(--hw-eq)'
      if (fill.current) { fill.current.style.width = pos(st); fill.current.style.background = color }
      if (tick.current) tick.current.style.left = pos(mo)
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frame])
  return (
    <div className={compact ? '' : 'mt-2'}>
      <div className={`relative ${compact ? 'h-7 rounded-lg' : 'h-14 rounded-xl'} overflow-hidden`} style={{ background: 'rgba(244,239,226,.08)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.6)' }}>
        <div className="absolute inset-y-0" style={{ left: pos(GOOD_LUFS[0]), width: `calc(${pos(GOOD_LUFS[1])} - ${pos(GOOD_LUFS[0])})`, background: 'rgba(31,191,127,.16)' }} />
        <div ref={fill} className="absolute left-0 top-3 bottom-3 rounded-r" />
        <div ref={tick} className="absolute inset-y-2 w-1.5 -ml-0.5 rounded" style={{ background: 'rgba(244,239,226,.9)' }} />
        <div className="absolute inset-y-0 w-0.5" style={{ left: pos(TARGET_LUFS), background: 'rgba(244,239,226,.75)' }} />
      </div>
      {!compact && <div className="lbl flex justify-between text-lg mt-1"><span>Quiet</span><span>Target</span><span>Loud</span></div>}
    </div>
  )
}
