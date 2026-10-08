'use client'

import { useEffect, useMemo, useState } from 'react'

// Live readings for the operations screen. Samples come from the same public now-playing feed the listeners use,
// every 10 seconds, kept for the last 30 minutes in this browser (and carried across reloads in the tab).
const EVERY_MS = 10_000
const KEEP = 180
const STORE = 'br-ops-telemetry'

interface Sample { t: number; listeners: number; ms: number; ok: boolean }
interface Feed { listeners: number; elapsed: number; duration: number; isLive: boolean; updatedAt: number; title: string; artist: string }

function Spark({ values, h = 44, stroke = 'var(--br-accent)', floor = 0, label }: { values: number[]; h?: number; stroke?: string; floor?: number; label: string }) {
  const w = 300
  const max = Math.max(1, ...values), min = Math.min(floor, ...values)
  const pts = values.map((v, i) => `${values.length < 2 ? 0 : (i / (values.length - 1)) * w},${h - 3 - ((v - min) / (max - min || 1)) * (h - 8)}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label} className="w-full" style={{ height: h }}>
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="var(--br-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
    </svg>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function Telemetry() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [feed, setFeed] = useState<Feed | null>(null)
  const [now, setNow] = useState(0)
  const [gotAt, setGotAt] = useState(0)

  useEffect(() => {
    try { const s = JSON.parse(sessionStorage.getItem(STORE) ?? '[]'); if (Array.isArray(s)) queueMicrotask(() => setSamples(s.slice(-KEEP))) } catch { /* no storage */ }
    let alive = true
    const poll = async () => {
      if (document.hidden) return
      const t0 = performance.now()
      let s: Sample
      try {
        const r = await fetch('/api/nowplaying', { cache: 'no-store' })
        const d = r.ok ? await r.json() : null
        const ms = Math.round(performance.now() - t0)
        if (!d) throw new Error('bad')
        if (!alive) return
        setFeed(d); setGotAt(Date.now())
        s = { t: Date.now(), listeners: Number(d.listeners) || 0, ms, ok: true }
      } catch {
        if (!alive) return
        s = { t: Date.now(), listeners: 0, ms: Math.round(performance.now() - t0), ok: false }
      }
      setSamples(prev => {
        const next = [...prev, s].slice(-KEEP)
        try { sessionStorage.setItem(STORE, JSON.stringify(next)) } catch { /* no storage */ }
        return next
      })
    }
    poll()
    const id = setInterval(poll, EVERY_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { alive = false; clearInterval(id); clearInterval(tick) }
  }, [])

  const good = useMemo(() => samples.filter(s => s.ok), [samples])
  const listeners = good.map(s => s.listeners)
  const lat = good.map(s => s.ms)
  const failed = samples.slice(-6).filter(s => !s.ok).length
  const stale = gotAt > 0 && now - gotAt > 3 * EVERY_MS
  const status = !samples.length ? 'CONNECTING' : failed >= 3 || stale ? 'DEGRADED' : 'NOMINAL'
  const peak = listeners.length ? Math.max(...listeners) : 0
  const avgLat = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0
  const lastLat = lat.length ? lat[lat.length - 1] : 0
  const elapsed = feed && !feed.isLive && feed.duration > 0 ? Math.min(feed.duration, feed.elapsed + (gotAt && now ? (now - gotAt) / 1000 : 0)) : 0
  const pct = feed && feed.duration > 0 ? (elapsed / feed.duration) * 100 : 0
  const dot = status === 'NOMINAL' ? 'bg-br-gold' : status === 'DEGRADED' ? 'bg-br-red' : 'bg-br-dk-muted'
  const span = samples.length > 1 ? Math.round((samples[samples.length - 1].t - samples[0].t) / 60_000) : 0

  return (
    <section className="sk-raised p-4 space-y-4" aria-label="Live telemetry">
      <div className="flex items-center gap-3">
        <h2 className="text-br-gold text-xs">TELEMETRY</h2>
        <span className="flex items-center gap-1.5 text-xs text-br-dk-text"><span className={`inline-block w-2 h-2 rounded-full ${dot}`} />{status}</span>
        <span className="ml-auto text-[11px] text-br-dk-muted tabular-nums">window {span}m · sample {EVERY_MS / 1000}s</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-br-dk-sub">listeners</span>
            <span className="text-br-dk-text tabular-nums"><span className="text-xl">{good.length ? listeners[listeners.length - 1] : '--'}</span> <span className="text-br-dk-muted">peak {peak}</span></span>
          </div>
          <Spark values={listeners} label="Listeners over the last 30 minutes" />
        </div>
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-br-dk-sub">feed latency</span>
            <span className="text-br-dk-text tabular-nums"><span className="text-xl">{good.length ? lastLat : '--'}</span> ms <span className="text-br-dk-muted">avg {avgLat}</span></span>
          </div>
          <Spark values={lat} stroke="var(--br-sub)" label="Feed latency over the last 30 minutes" />
        </div>
      </div>

      <div className="text-xs space-y-1.5">
        <div className="flex justify-between gap-3">
          <span className="text-br-dk-sub shrink-0">{feed?.isLive ? 'source' : 'track'}</span>
          <span className="text-br-dk-text truncate">{feed ? (feed.isLive ? 'live input' : [feed.artist, feed.title].filter(Boolean).join(' - ') || '--') : '--'}</span>
        </div>
        <div className="h-1.5 bg-[var(--sk-field)] border border-br-dk-border" role="progressbar" aria-label="Track progress" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-br-gold" style={{ width: `${feed?.isLive ? 100 : pct}%`, opacity: feed?.isLive ? 0.35 : 1 }} />
        </div>
        <div className="flex justify-between text-br-dk-muted tabular-nums">
          <span>{feed?.isLive ? 'live' : mmss(elapsed)}</span>
          <span>feed age {gotAt && now ? Math.max(0, Math.round((now - gotAt) / 1000)) : 0}s</span>
          <span>{feed?.isLive ? '--' : mmss(feed?.duration ?? 0)}</span>
        </div>
      </div>
    </section>
  )
}
