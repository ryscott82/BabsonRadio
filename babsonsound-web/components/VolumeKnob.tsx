'use client'

import { useRef } from 'react'

/** Volume knob: drag up/down (or use the arrow keys) to turn it. A ring of dots shows the level. */
export default function VolumeKnob({ value, onChange, max = 1, unity = 1, boostDb = 0 }: { value: number; onChange: (v: number) => void; max?: number; unity?: number; boostDb?: number }) {
  const start = useRef<{ y: number; v: number } | null>(null)
  const motion = useRef({ y: 0, t: 0, speed: 0 }) // how fast the knob is being dragged, in pixels per millisecond (smoothed)
  const clamp = (v: number) => Math.min(max, Math.max(0, v))
  // Detent at 0 dB. The sticky zone follows the speed of the drag: sweep fast and it is wide (easy to land on, and the boost is only entered on purpose),
  // go slowly and it is narrow (fine control right up to the detent).
  const SNAP_SLOW = 0.02, SNAP_FAST = 0.16, FAST_PX_PER_MS = 1.4
  const snap = (v: number) => {
    const w = SNAP_SLOW + (SNAP_FAST - SNAP_SLOW) * Math.min(1, motion.current.speed / FAST_PX_PER_MS)
    return unity < 1 && Math.abs(v - unity) < w ? unity : v
  }
  const track = (y: number, t: number) => {
    const m = motion.current, dt = Math.max(1, t - m.t)
    m.speed += (Math.abs(y - m.y) / dt - m.speed) * 0.35
    m.y = y; m.t = t
  }
  // Arrow keys stop at 0 dB when they would cross it.
  const step = (from: number, d: number) => { const n = from + d; return unity < 1 && (from - unity) * (n - unity) < 0 ? unity : n }
  const angle = -135 + value * 270
  // Ring glow: green at normal levels, then yellow as the boost starts, shading to red as it gets heavier.
  const heat = Math.min(1, Math.max(0, (boostDb - 2) / 3))
  const glow = boostDb > 0.05 ? `color-mix(in srgb, var(--eq-y) ${Math.round((1 - heat) * 100)}%, var(--eq-r))` : 'var(--eq-g)'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-[88px] h-[88px] flex items-center justify-center">
        {Array.from({ length: 11 }, (_, i) => {
          const a = ((-135 + (i / 10) * 270) * Math.PI) / 180
          return <i key={i} aria-hidden className={`hw-dot ${i / 10 <= value + 0.001 ? 'on' : ''} ${i / 10 > unity ? 'hot' : ''}`}
                    style={{ left: `calc(50% + ${Math.sin(a) * 42}px - 2px)`, top: `calc(50% - ${Math.cos(a) * 42}px - 2px)` }} />
        })}
        <div
          role="slider" tabIndex={0} aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-valuetext={boostDb > 0 ? `Boosted ${Math.round(boostDb)} decibels` : undefined}
          className={`hw-knob-sm w-[58px] h-[58px] rounded-full touch-none cursor-ns-resize select-none ${value > 0 ? 'hw-lit' : ''}`}
          style={{ ['--turn' as string]: `${angle}deg`, ['--glow' as string]: glow }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { y: e.clientY, v: value }; motion.current = { y: e.clientY, t: e.timeStamp, speed: 0 } }}
          onPointerMove={e => { if (start.current) { track(e.clientY, e.timeStamp); onChange(snap(clamp(start.current.v + (start.current.y - e.clientY) / 140))) } }}
          onPointerUp={() => { start.current = null }}
          onPointerCancel={() => { start.current = null }}
          onKeyDown={e => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onChange(clamp(step(value, 0.05))) }
            if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(clamp(step(value, -0.05))) }
          }}
        />
      </div>
      <span className="text-sm font-semibold text-br-dk-text">Volume{boostDb > 0.5 ? <span className="ml-1.5 text-[#E0412A]">+{Math.round(boostDb)} dB</span> : null}</span>
    </div>
  )
}
