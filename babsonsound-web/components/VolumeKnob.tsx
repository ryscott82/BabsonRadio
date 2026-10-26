'use client'

import { useRef } from 'react'

/** Volume knob: drag up/down (or use the arrow keys) to turn it. A ring of dots shows the level. */
export default function VolumeKnob({ value, onChange, max = 1, unity = 1, boostDb = 0 }: { value: number; onChange: (v: number) => void; max?: number; unity?: number; boostDb?: number }) {
  const start = useRef<{ y: number; v: number } | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(0, v))
  // Detent at 0 dB: a wide sticky zone so the boost (and its distortion) is only ever entered on purpose.
  const SNAP = 0.09
  const snap = (v: number) => (unity < 1 && Math.abs(v - unity) < SNAP ? unity : v)
  // Arrow keys stop at 0 dB when they would cross it.
  const step = (from: number, d: number) => { const n = from + d; return unity < 1 && (from - unity) * (n - unity) < 0 ? unity : n }
  const angle = -135 + value * 270
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
          className="hw-knob-sm w-[58px] h-[58px] rounded-full touch-none cursor-ns-resize select-none"
          style={{ ['--turn' as string]: `${angle}deg` }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { y: e.clientY, v: value } }}
          onPointerMove={e => { if (start.current) onChange(snap(clamp(start.current.v + (start.current.y - e.clientY) / 140))) }}
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
