'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BAND_HZ, DEFAULT_BOOST, attachSpectrum, boostCurve, probeCors, setBoostDb, setBoostSettings, type BoostSettings } from '@/lib/spectrum'

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? ''
const KEY = 'br-boost-lab'
const FREQS = Array.from({ length: 120 }, (_, i) => 20 * Math.pow(1000, i / 119)) // 20 Hz to 20 kHz, log-spaced
const fmtHz = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : String(hz))

// Admin-only workbench for the volume knob's boost zone: an 8-band EQ (what the sound does at +6 dB) and the overdrive parameters.
// Applies only in this browser while the page is open. When it sounds right, copy the numbers and they become the site's defaults.
export default function BoostLab() {
  const [s, setS] = useState<BoostSettings>(() => ({ ...DEFAULT_BOOST, bands: [...DEFAULT_BOOST.bands] }))
  const [boost, setBoost] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [msg, setMsg] = useState('')
  const audio = useRef<HTMLAudioElement | null>(null)

  // Remembered between visits (this browser only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const v = JSON.parse(raw) as BoostSettings
        if (Array.isArray(v.bands) && v.bands.length === BAND_HZ.length) queueMicrotask(() => setS({ ...DEFAULT_BOOST, ...v }))
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    setBoostSettings(s)
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
  }, [s])
  useEffect(() => { setBoostDb(playing && boost ? 6 : 0) }, [boost, playing])
  useEffect(() => () => {
    const el = audio.current
    if (el) { el.pause(); el.removeAttribute('src'); el.load() }
    setBoostDb(0)
  }, [])

  const toggle = useCallback(async () => {
    setMsg('')
    if (audio.current && !audio.current.paused) { audio.current.pause(); setPlaying(false); return }
    if (!audio.current) {
      if (!STREAM_URL) { setMsg('The stream address is not set.'); return }
      if (!(await probeCors(STREAM_URL))) { setMsg('This browser does not let the page process the stream (Safari does this). Try Chrome.'); return }
      const el = new Audio()
      el.crossOrigin = 'anonymous'
      if (!attachSpectrum(el)) { setMsg('The audio engine could not start in this browser.'); return }
      el.src = STREAM_URL
      audio.current = el
    }
    audio.current.play().then(() => setPlaying(true)).catch(() => setMsg('The stream could not start.'))
  }, [])

  const set = (patch: Partial<BoostSettings>) => setS(prev => ({ ...prev, ...patch }))
  const setBand = (i: number, v: number) => setS(prev => ({ ...prev, bands: prev.bands.map((g, j) => (j === i ? v : g)) }))
  const copy = async () => {
    const text = JSON.stringify(s, null, 2)
    try { await navigator.clipboard.writeText(text); setMsg('Copied. Send these numbers to Claude to make them the site default.') } catch { setMsg(text) }
  }

  // Frequency response at +6 dB, drawn in a 600 x 220 box: 20 Hz to 20 kHz across, -15 to +15 dB up.
  const W = 600, H = 220, dbToY = (db: number) => H / 2 - (Math.max(-15, Math.min(15, db)) / 15) * (H / 2 - 8)
  const hzToX = (hz: number) => (Math.log(hz / 20) / Math.log(1000)) * W
  const curve = typeof OfflineAudioContext === 'undefined' ? FREQS.map(() => 0) : boostCurve(FREQS, s, 1)
  const path = curve.map((db, i) => `${i ? 'L' : 'M'}${hzToX(FREQS[i]).toFixed(1)} ${dbToY(db).toFixed(1)}`).join(' ')

  const slider = (label: string, value: number, min: number, max: number, step: number, on: (v: number) => void, unit = '') => (
    <label className="block text-sm" key={label}>
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums">{value}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => on(Number(e.target.value))} className="w-full" />
    </label>
  )

  return (
    <section className="ops-card p-5 space-y-4 min-w-0">
      <h3 className="text-xl font-light">Volume boost: EQ and overdrive</h3>
      <p className="text-base opacity-90">
        What the sound does when the volume knob is turned all the way up (+6 dB). Listen here with the live stream and change the numbers. Only in this browser; nothing is saved to the site.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggle} aria-pressed={playing} className="ops-btn px-4 py-2">{playing ? 'Pause stream' : 'Play stream'}</button>
        <button type="button" onClick={() => setBoost(b => !b)} aria-pressed={boost} className="ops-btn px-4 py-2">{boost ? 'Boost on (+6 dB)' : 'Boost off (normal)'}</button>
        <button type="button" onClick={() => setS({ ...DEFAULT_BOOST, bands: [...DEFAULT_BOOST.bands] })} className="ops-btn px-4 py-2">Reset to site default</button>
        <button type="button" onClick={copy} className="ops-btn px-4 py-2">Copy numbers</button>
      </div>
      {msg && <p className="text-sm whitespace-pre-wrap" role="status">{msg}</p>}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[720px] rounded-lg" style={{ background: 'rgba(0,0,0,.35)' }} role="img" aria-label="EQ curve at plus 6 decibels">
        {[-12, -6, 0, 6, 12].map(db => (
          <g key={db}>
            <line x1="0" x2={W} y1={dbToY(db)} y2={dbToY(db)} stroke="rgba(255,255,255,.18)" strokeWidth={db === 0 ? 1.5 : 1} />
            <text x="4" y={dbToY(db) - 3} fontSize="10" fill="rgba(255,255,255,.7)">{db > 0 ? `+${db}` : db}</text>
          </g>
        ))}
        {[100, 1000, 10000].map(hz => (
          <g key={hz}>
            <line y1="0" y2={H} x1={hzToX(hz)} x2={hzToX(hz)} stroke="rgba(255,255,255,.12)" />
            <text x={hzToX(hz) + 3} y={H - 4} fontSize="10" fill="rgba(255,255,255,.7)">{fmtHz(hz)}</text>
          </g>
        ))}
        {BAND_HZ.map((hz, i) => <circle key={hz} cx={hzToX(hz)} cy={dbToY(s.bands[i])} r="3.5" fill="#7CFF9B" opacity=".7" />)}
        <path d={path} fill="none" stroke="#7CFF9B" strokeWidth="2.5" />
      </svg>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {BAND_HZ.map((hz, i) => slider(`${fmtHz(hz)} Hz`, s.bands[i], -12, 12, 0.5, v => setBand(i, v), ' dB'))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {slider('Overall volume added', s.level, 0, 8, 0.5, v => set({ level: v }), ' dB')}
        {slider('Glue compression', s.comp, 0, 1.5, 0.05, v => set({ comp: v }))}
        {slider('Overdrive amount (0 = none)', s.overdrive, 0, 1, 0.05, v => set({ overdrive: v }))}
        {slider('Overdrive: how hard it is driven', s.drive, 0, 8, 0.25, v => set({ drive: v }))}
        {slider('Overdrive: only above', s.crunchHz, 300, 8000, 100, v => set({ crunchHz: v }), ' Hz')}
        {slider('Sparkle (shimmer on the highs)', s.sparkle, 0, 1, 0.05, v => set({ sparkle: v }))}
      </div>
    </section>
  )
}
