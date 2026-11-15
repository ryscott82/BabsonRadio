'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { METER_CELLS, cellZone, cellsLit, levelAdvice, levelWord, type LevelState } from '@/lib/booth'
import type { MeterFrame, MeterStats } from './useInputMeter'
import { Led, Sw } from './es2/Stage'

// Level read-out on the left pane of the panel: what goes to the station (the mixer input plus BUTT's gain) as a column of lit cells.
// Green at the bottom, yellow near the top (the sweet spot), orange at the very top (clipping or sustained loudness).
// Too quiet is the column sitting low, with a line saying what to do. Dead air takes it over.

const TIP: Record<LevelState, string> = {
  off: 'Tap anywhere to start it.',
  silent: 'Check the mics and the mixer.',
  quiet: '',
  good: 'Right where it should be.',
  near: 'Nice and strong. Keep it here.',
  loud: '',
}
const PEAK_HOLD_MS = 1500
const CELL_W = 26, CELL_H = 9, FRAME = { off: 0, green: 1, yellow: 2, red: 3 } as const

export interface AutoLevel { available: boolean; on: boolean; db: number; error: string; toggle: () => void }

export default function LevelMeter({ frame, stats, error, deadAir, auto, staff = false, night }: {
  frame: RefObject<MeterFrame>; stats: MeterStats; error: string; deadAir: number; auto: AutoLevel
  /** Admins and the E-board see a short note when Auto level is not set up; nobody else sees anything about it. */
  staff?: boolean
  night: boolean
}) {
  const gain = auto.on ? auto.db : 0
  const state: LevelState = stats.state // already includes BUTT's gain (see useInputMeter)
  const { word, tone } = levelWord(state)
  const adv = levelAdvice(stats.mid, state)
  const action = adv.dir === 'up' ? `Turn the mixer up ${adv.amount}` : adv.dir === 'down' ? (adv.amount === 'now' ? 'Turn it down now' : `Turn the mixer down ${adv.amount}`) : ''
  const autoNote = auto.on && Math.abs(auto.db) >= 3 ? `Auto level is ${auto.db > 0 ? 'adding' : 'cutting'} ${Math.abs(Math.round(auto.db))} dB.` : ''
  const tip = error || (deadAir > 0 ? `${deadAir} seconds of silence on air.` : action || TIP[state] || autoNote)
  const alert = deadAir > 0 || tone === 'warn' || !!error
  return (
    <div className="g hf">
      <div className="eng h" style={{ left: 24, top: 64 }}>Loudness</div>
      <div className="eng s" style={{ left: 140, top: 66 }}>Mic in</div>
      <Led c={stats.on ? (alert ? 'orange' : 'green') : ''} style={{ left: 170, top: 64 }} />
      <div id="meterbox" className="lw"><Bar frame={frame} gain={gain} night={night} /></div>
      <div className="zone eng" id="zone0"><b>Too loud</b><small>Turn down</small></div>
      <div className="zone eng" id="zone1"><b>Sweet spot</b><small>Aim here</small></div>
      <div className="zone eng" id="zone2"><b>Good</b></div>
      <div className="zone eng" id="zone3"><b>Too quiet</b><small>Turn up</small></div>
      <div id="fb" className="lw" aria-live="polite">
        <span id="fbmain" className={`px inv ${alert ? 'org' : ''}`}>{deadAir > 0 ? 'Dead air' : word}</span>
        <span id="fbsub" className={`px ${alert ? 'org' : 'dim'}`}>{tip}</span>
      </div>
      {/* Auto level works once the helper reports the MIDI add-on is ready; until then the switch stays off. */}
      <div className="eng s" style={{ left: 24, top: 462 }} title={!auto.available && staff ? 'Auto level isn’t set up.' : undefined}>Auto level</div>
      <Sw id="autosw" on={auto.available && auto.on} label="Auto level" onChange={() => { if (auto.available) auto.toggle() }} />
      <Led id="autoled" c={auto.available && auto.on ? 'green' : ''} />
      <div id="autolcd" className="lw row px">{!auto.available ? (staff ? 'n/a' : 'off') : auto.on ? `${auto.db > 0 ? '+' : ''}${auto.db.toFixed(1)}` : 'off'}</div>
    </div>
  )
}

/** The gauge: cells lit from the bottom for the loudness of the last 10 s, plus one cell that holds the latest peak for a moment.
 *  Drawn from the cells sprite, and only when something changed. */
export function Bar({ frame, gain, night }: { frame: RefObject<MeterFrame>; gain: number; night: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const g = useRef(gain)
  useEffect(() => { g.current = gain }, [gain])
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.src = `/booth-es2/${night ? 'night' : 'day'}/cells.png`
    let raf = 0, peak = 0, peakAt = 0, drawn = ''
    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (!img.complete || !img.naturalWidth) return
      const f = frame.current, now = performance.now()
      const lvl = Number.isFinite(f.long) ? f.long : f.short
      const lit = cellsLit(Number.isFinite(lvl) ? lvl + g.current : -Infinity)
      const mom = cellsLit(Number.isFinite(f.momentary) ? f.momentary + g.current : -Infinity)
      if (mom >= peak || now - peakAt > PEAK_HOLD_MS) { peak = mom; peakAt = now }
      const key = `${lit}:${peak}`
      if (key === drawn) return
      drawn = key
      ctx.clearRect(0, 0, CELL_W * 2, METER_CELLS * CELL_H + 2)
      for (let i = 0; i < METER_CELLS; i++) {
        const on = i < lit || (i === peak - 1 && peak > lit)
        const y = METER_CELLS * CELL_H + 1 - CELL_H * (i + 1)
        for (let c = 0; c < 2; c++) ctx.drawImage(img, 0, (on ? FRAME[cellZone(i)] : FRAME.off) * CELL_H, CELL_W, CELL_H, c * CELL_W, y, CELL_W, CELL_H)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frame, night])
  return <canvas ref={canvas} id="meter" width={CELL_W * 2} height={METER_CELLS * CELL_H + 2} role="img" aria-label="Level" />
}
