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
      <div className="sk-field rounded-xl w-[3rem] sm:w-24 lg:w-28 py-3 sm:py-4 text-center">
        <span className="font-display text-3xl sm:text-6xl lg:text-7xl text-br-dk-text tabular-nums leading-none">{value}</span>
      </div>
      <span className="font-display tracking-[0.2em] text-[0.65rem] sm:text-sm text-br-dk-sub">{label}</span>
    </div>
  )
}

/** Four big tiles for the countdown page. */
export function CountdownTiles() {
  const t = useCountdown()
  return (
    <div className="flex items-start gap-1 sm:gap-5" role="timer" aria-label="Time until launch">
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

/** The big one for the waiting screen: a black glass window with glowing digits, the seconds ticking on their own beat. */
export function CountdownBig() {
  const t = useCountdown()
  const cells: [string, string][] = [
    [t ? two(t.days) : '--', 'Days'], [t ? two(t.hours) : '--', 'Hours'],
    [t ? two(t.mins) : '--', 'Minutes'], [t ? two(t.secs) : '--', 'Seconds'],
  ]
  return (
    <div role="timer" aria-label="Time until launch"
      className="w-full rounded-2xl bg-[#07090a] px-3 sm:px-8 py-6 sm:py-9 shadow-[inset_0_2px_14px_rgba(0,0,0,.9),inset_0_0_0_1px_rgba(255,255,255,.07),0_2px_0_rgba(255,255,255,.18)]">
      <div className="flex items-start justify-center gap-1.5 sm:gap-4">
        {cells.map(([v, label], i) => (
          <div key={label} className="flex items-start gap-1.5 sm:gap-4">
            <div className="flex flex-col items-center gap-2 sm:gap-3 min-w-[3.4rem] sm:min-w-[7rem]">
              <span className="font-display tabular-nums leading-none text-[2.9rem] sm:text-[6.5rem] text-[#3DE0A0] [text-shadow:0_0_18px_rgba(61,224,160,.55),0_0_2px_rgba(190,255,230,.9)]">{v}</span>
              <span className="font-display tracking-[0.18em] text-[0.6rem] sm:text-sm text-[#8FB5A6]">{label}</span>
            </div>
            {i < 3 && <span aria-hidden className="font-display leading-none text-[2.9rem] sm:text-[6.5rem] text-[#3DE0A0]/50 animate-pulse">:</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
