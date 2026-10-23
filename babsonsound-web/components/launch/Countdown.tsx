'use client'

import { useEffect, useState } from 'react'
import { LAUNCH_MS, timeLeft } from '@/lib/launch'

/** Ticks once a second in the browser. Returns null until mounted so the server and browser render the same thing. */
export function useCountdown() {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()))
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now === null ? null : timeLeft(LAUNCH_MS - now)
}

const two = (n: number) => String(n).padStart(2, '0')

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="sk-field rounded-xl w-[3.7rem] sm:w-24 lg:w-28 py-3 sm:py-5 text-center">
        <span className="font-display text-4xl sm:text-6xl lg:text-7xl text-br-dk-text tabular-nums leading-none">{value}</span>
      </div>
      <span className="font-display tracking-[0.2em] text-[0.65rem] sm:text-xs text-br-dk-sub uppercase">{label}</span>
    </div>
  )
}

/** Four big tiles for the countdown page. */
export function CountdownTiles() {
  const t = useCountdown()
  return (
    <div className="flex items-start gap-2 sm:gap-5" role="timer" aria-label="Time until launch">
      <Tile value={t ? two(t.days) : '--'} label="Days" />
      <Tile value={t ? two(t.hours) : '--'} label="Hours" />
      <Tile value={t ? two(t.mins) : '--'} label="Minutes" />
      <Tile value={t ? two(t.secs) : '--'} label="Seconds" />
    </div>
  )
}

/** One quiet line for the waiting screen. */
export function CountdownLine() {
  const t = useCountdown()
  return (
    <p role="timer" aria-label="Time until launch" className="font-display text-br-dk-sub text-lg tabular-nums tracking-wide min-h-[1.75rem]">
      {t ? `${t.days}d ${two(t.hours)}h ${two(t.mins)}m ${two(t.secs)}s` : ''}
    </p>
  )
}
