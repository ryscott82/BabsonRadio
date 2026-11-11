'use client'

import { useEffect, useRef, useState } from 'react'

export interface ChartSeries { name: string; pts: { x: number; y: number; tip?: string }[]; color: string; dash?: string; marker?: boolean; width?: number }
export interface Tick { v: number; label: string }

const M = { l: 48, r: 14, t: 14, b: 30 }

/**
 * A plain SVG line chart that measures its own width, so the text stays a readable size on a phone.
 * The numbers are always in the history table too, so the chart is a picture of them (aria-label says what it shows).
 */
export default function LineChart({ series, xDomain, xTicks, yMax, yTicks, yFormat, refLine, aria, empty }: {
  series: ChartSeries[]; xDomain: [number, number]; xTicks: Tick[]; yMax: number; yTicks: number[]; yFormat: (v: number) => string
  refLine?: { y: number; label: string }; aria: string; empty?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const set = () => setW(Math.max(260, Math.floor(el.clientWidth)))
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = w < 420 ? 220 : 260
  const iw = w - M.l - M.r, ih = H - M.t - M.b
  const [x0, x1] = xDomain
  const X = (v: number) => M.l + (x1 === x0 ? iw / 2 : ((v - x0) / (x1 - x0)) * iw)
  const Y = (v: number) => M.t + ih - (Math.min(v, yMax) / yMax) * ih
  const any = series.some(s => s.pts.length)
  // Keep a date label only when there is room for it after the last one kept (labels never run into each other on a phone).
  const shownTicks: Tick[] = []
  for (const t of xTicks) if (!shownTicks.length || X(t.v) - X(shownTicks[shownTicks.length - 1].v) >= 58) shownTicks.push(t)
  return (
    <div ref={box} className="w-full">
      <svg width={w} height={H} role="img" aria-label={aria} className="block">
        {yTicks.map(t => (
          <g key={t}>
            <line x1={M.l} x2={w - M.r} y1={Y(t)} y2={Y(t)} stroke="#fff" strokeOpacity={t === 0 ? 0.6 : 0.2} />
            <text x={M.l - 8} y={Y(t)} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="#fff">{yFormat(t)}</text>
          </g>
        ))}
        {shownTicks.map(t => (
          <g key={t.v}>
            <line x1={X(t.v)} x2={X(t.v)} y1={M.t + ih} y2={M.t + ih + 4} stroke="#fff" strokeOpacity={0.6} />
            <text x={X(t.v)} y={H - 8} textAnchor="middle" fontSize="12" fill="#fff">{t.label}</text>
          </g>
        ))}
        {refLine && (
          <g>
            <line x1={M.l} x2={w - M.r} y1={Y(refLine.y)} y2={Y(refLine.y)} stroke="#ffd166" strokeWidth={2} />
            <text x={M.l + 6} y={Y(refLine.y) - 6} fontSize="12" fill="#ffd166">{refLine.label}</text>
          </g>
        )}
        {series.map(s => s.pts.length > 0 && (
          <g key={s.name}>
            {s.pts.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth={s.width ?? 2.5} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" points={s.pts.map(p => `${X(p.x)},${Y(p.y)}`).join(' ')} />}
            {(s.marker || s.pts.length === 1) && s.pts.map(p => <circle key={p.x} cx={X(p.x)} cy={Y(p.y)} r={4.5} fill={s.color} stroke="#0a3f27" strokeWidth={1.5}>{p.tip && <title>{p.tip}</title>}</circle>)}
          </g>
        ))}
        {!any && <text x={w / 2} y={M.t + ih / 2} textAnchor="middle" fontSize="14" fill="#fff">{empty ?? 'No data yet.'}</text>}
      </svg>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-sm" aria-label="Chart key">
        {series.map(s => (
          <li key={s.name} className="flex items-center gap-2">
            <svg width="28" height="10" aria-hidden><line x1="1" x2="27" y1="5" y2="5" stroke={s.color} strokeWidth={s.width ?? 2.5} strokeDasharray={s.dash} />{s.marker && <circle cx="14" cy="5" r="3.5" fill={s.color} />}</svg>
            {s.name}
          </li>
        ))}
        {refLine && <li className="flex items-center gap-2"><svg width="28" height="10" aria-hidden><line x1="1" x2="27" y1="5" y2="5" stroke="#ffd166" strokeWidth={2} /></svg>{refLine.label}</li>}
      </ul>
    </div>
  )
}
