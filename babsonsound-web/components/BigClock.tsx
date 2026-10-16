'use client'

import { useEffect, useState } from 'react'

/** A big desk-clock readout: "1:19" with a small AM/PM, the date underneath. Updates on the minute. Shows nothing until the browser has its time, so it never flashes the server's. */
export default function BigClock({ color = '#fff', accent, className = '', sizeClass = 'text-[clamp(4.5rem,15vw,15rem)]' }: {
  color?: string; accent?: string; className?: string; sizeClass?: string
}) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const tick = () => { setNow(new Date()); t = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50) }
    tick()
    return () => clearTimeout(t)
  }, [])
  if (!now) return <div className={className} style={{ minHeight: '1em' }} aria-hidden />

  const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatToParts(now)
  const time = parts.filter(p => p.type === 'hour' || p.type === 'minute' || p.type === 'literal').map(p => p.value).join('').trim()
  const suffix = parts.find(p => p.type === 'dayPeriod')?.value ?? ''
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now)

  return (
    <div className={`font-display leading-none text-center ${className}`} style={{ color }}>
      <div className={`${sizeClass} tracking-wide tabular-nums`}>
        {time}
        {suffix && <span className="ml-[0.08em] align-baseline text-[0.26em] tracking-[0.1em]" style={{ color: accent || color }}>{suffix}</span>}
      </div>
      <div className="mt-[0.5vh] text-[clamp(0.9rem,1.8vw,1.75rem)] tracking-[0.3em] uppercase opacity-70">{date}</div>
    </div>
  )
}
