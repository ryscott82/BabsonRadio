'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { mountStage } from './painter'
import { loadPref, savePref } from '../helper'

// The ES2 hardware panel: a 960 x 540 stage (doubled on the studio screen) with baked faceplates from /public/booth-es2.
// Positions of everything with an id come from /booth-es2/layout.css, which design/booth-es2/make_assets.py writes together
// with the bitmaps. To move something, change the table in that script and re-run it; do not hand-edit positions here.

// ---------- panel sounds (off until the Audio switch is on) ----------
let actx: AudioContext | null = null
let soundOn = false
function ctxNow(): AudioContext | null {
  if (!soundOn) return null
  try {
    actx ??= new AudioContext()
    if (actx.state === 'suspended') void actx.resume().catch(() => {})
    return actx
  } catch { return null }
}
function tone(f: number, dur: number, type: OscillatorType, vol: number) {
  const c = ctxNow()
  if (!c) return
  try {
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02)
  } catch { /* no sound */ }
}
function click(vol: number, freq: number) {
  const c = ctxNow()
  if (!c) return
  try {
    const n = Math.floor(c.sampleRate * 0.014), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3)
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol
    s.connect(f); f.connect(g); g.connect(c.destination); s.start()
  } catch { /* no sound */ }
}
export const snd = {
  sw: (on: boolean) => { click(0.35, 1800); setTimeout(() => click(0.2, 3200), 28); tone(on ? 1320 : 880, 0.06, 'sine', 0.03) },
  tick: () => click(0.1, 4200),
  btn: () => { click(0.28, 2300); tone(660, 0.035, 'square', 0.012) },
}

// ---------- small parts ----------
export function Ic({ n }: { n: string }) { return <svg aria-hidden><use href={`#i-${n}`} /></svg> }

export function Led({ id, c, style }: { id?: string; c?: '' | 'green' | 'orange'; style?: CSSProperties }) {
  return <i className="led" id={id} data-c={c || undefined} style={style} />
}

export function Btn({ id, kind = 'm', on, className = '', children, ...rest }: {
  id?: string; kind?: 'm' | 'gr' | 'lv'; on?: boolean; className?: string; children?: ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'id' | 'className' | 'type'>) {
  return <button type="button" id={id} className={`btn ${kind} ${on ? 'on' : ''} ${className}`} {...rest}>{children}</button>
}

export function Sw({ id, on, onChange, label, lg }: { id: string; on: boolean; onChange: (v: boolean) => void; label: string; lg?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} id={id} className={`sw ${lg ? 'lg' : ''}`} onClick={() => { snd.sw(!on); onChange(!on) }} />
}

/** A rotary knob. The body is baked into the faceplate; this adds the orange value arc, the name (top left, 45 degrees) and the value window. */
export function Knob({ id, label, value, min, max, text, onChange }: { id: string; label: string; value: number; min: number; max: number; text: string; onChange: (v: number) => void }) {
  const drag = useRef<{ x: number; y: number; v: number } | null>(null)
  const span = max - min, n = Math.max(0, Math.min(1, (value - min) / span)), rc = 28.6
  const pt = (a: number) => { const r = (a * Math.PI) / 180; return `${(34 + rc * Math.sin(r)).toFixed(2)} ${(34 - rc * Math.cos(r)).toFixed(2)}` }
  const a = -135 + 270 * n
  const d = n < 0.004 ? '' : `M${pt(-135)}A${rc} ${rc} 0 ${a + 135 > 180 ? 1 : 0} 1 ${pt(a)}`
  const set = (v: number) => {
    const c = Math.max(min, Math.min(max, v))
    if (Math.round(((c - min) / span) * 63) !== Math.round(n * 63)) snd.tick()
    onChange(c)
  }
  return (
    <>
      <div className="knob" id={`k-${id}`} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text}
           onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, v: value }; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* fine */ } e.preventDefault(); e.currentTarget.focus() }}
           onPointerMove={e => { const g = drag.current; if (g) set(g.v + ((g.y - e.clientY + (e.clientX - g.x)) / 170) * span) }}
           onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
           onKeyDown={e => {
             if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { set(value + span / 63); e.preventDefault() }
             else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { set(value - span / 63); e.preventDefault() }
           }}>
        <svg viewBox="0 0 68 68" aria-hidden><path d={d} /></svg>
      </div>
      <div className="kl eng" id={`kl-${id}`}>{label}</div>
      <div className="kv lw px" id={`kv-${id}`}>{text}</div>
    </>
  )
}

function Symbols() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <symbol id="i-globe" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></g></symbol>
      <symbol id="i-video" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 9v6l5-3z" fill="currentColor" /></symbol>
      <symbol id="i-doc" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h8l4 4v14H6z" /><path d="M9 11h6M9 15h6" /></g></symbol>
      <symbol id="i-note" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 3v18M12 8h4M12 12h4" /></g></symbol>
      <symbol id="i-wave" viewBox="0 0 24 24"><path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></symbol>
      <symbol id="i-help" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M9.2 9.5a2.9 2.9 0 1 1 4.3 2.6c-.9.5-1.5 1-1.5 2.1" /></g><circle cx="12" cy="17.3" r="1.3" fill="currentColor" /></symbol>
      <symbol id="i-gear" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></g></symbol>
      <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="currentColor" /></symbol>
      <symbol id="i-pause" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" /></symbol>
      <symbol id="i-max" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.4" /></symbol>
      <symbol id="i-split" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M12 4v16" /></g></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.8" /></symbol>
    </svg>
  )
}

/** A picture drawn at panel resolution (so it is as low-res as everything else), cropped to fill unless `contain`. */
export function LowImg({ src, w, h, alt, id, contain }: { src: string; w: number; h: number; alt: string; id?: string; contain?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d')
    if (!c || !ctx) return
    let dead = false
    const img = new Image()
    img.onload = () => {
      if (dead) return
      ctx.clearRect(0, 0, w, h); ctx.imageSmoothingQuality = 'high'
      const iw = img.naturalWidth, ih = img.naturalHeight
      if (!iw || !ih) { ctx.drawImage(img, 0, 0, w, h); return }
      const k = contain ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    }
    img.onerror = () => { if (!dead) ctx.clearRect(0, 0, w, h) }
    img.src = src
    return () => { dead = true }
  }, [src, w, h, contain])
  return <canvas ref={ref} id={id} className="low" width={w} height={h} role="img" aria-label={alt} />
}

/** A QR code (an SVG of 1 x 1 squares) drawn module by module at a whole number of panel pixels each, with no smoothing, so it is as low-res as the rest. */
export function LowQr({ src, size, alt }: { src: string; size: number; alt: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d')
    if (!c || !ctx) return
    let dead = false
    fetch(src).then(r => r.text()).then(svg => {
      if (dead) return
      const vb = /viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(svg)
      if (!vb) return
      const [x0, y0, n] = [Number(vb[1]), Number(vb[2]), Number(vb[3])]
      const path = /<path[^>]* d="([^"]+)"/.exec(svg)?.[1] ?? ''
      const mod = Math.max(1, Math.floor(size / n)), off = Math.floor((size - n * mod) / 2)
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = '#0a1a10'
      for (const m of path.matchAll(/M(-?\d+) (-?\d+)h1v1h-1z/g)) ctx.fillRect(off + (Number(m[1]) - x0) * mod, off + (Number(m[2]) - y0) * mod, mod, mod)
    }).catch(() => {})
    return () => { dead = true }
  }, [src, size])
  return <canvas ref={ref} className="low" width={size} height={size} role="img" aria-label={alt} />
}

// ---------- the stage ----------
export function Stage({ view, night, split = '', live = false, drift, children }: {
  view: 'welcome' | 'booth'; night: boolean; split?: '' | 'split' | 'full'; live?: boolean; drift?: { x: number; y: number }; children: ReactNode
}) {
  const stage = useRef<HTMLDivElement>(null), fit = useRef<HTMLDivElement>(null), mx = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!stage.current || !fit.current || !mx.current) return
    return mountStage(stage.current, fit.current, mx.current)
  }, [])
  const dx = drift?.x ?? 0, dy = drift?.y ?? 0
  useEffect(() => { window.dispatchEvent(new Event('resize')) }, [dx, dy, split])
  useEffect(() => {
    const h = (e: PointerEvent) => { if (e.target instanceof Element && e.target.closest('#stage .btn')) snd.btn() }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [])
  return (
    <div id="es2-screen">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/booth-es2/layout.css" precedence="es2" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/booth-es2/es2.css" precedence="es2" />
      <Symbols />
      <div id="fit" ref={fit}>
        <div id="stage" ref={stage} data-layer="" data-theme={night ? 'night' : 'day'} data-view={view} data-split={split || 'off'} data-dx={dx} data-dy={dy} className={live ? 'live' : undefined}>
          <div id="face" className="nofull" />
          {children}
          <canvas className="txl" width={960} height={540} />
        </div>
      </div>
      <div id="mx" ref={mx} aria-hidden />
    </div>
  )
}

const LINKS: readonly [string, string][] = [['globe', 'Web'], ['video', 'YouTube'], ['doc', 'Docs'], ['note', 'Notion'], ['wave', 'BandLab']]

/** The top bar. `onLink(i)`: 0 is the plain browser, 1 to 4 are the quick links in the order above. */
export function Header({ now, onLink, onHelp, onSettings, browser }: {
  now: number; onLink: (i: number) => void; onHelp: () => void; onSettings?: () => void
  browser?: { full: boolean; onLayout: () => void; onClose: () => void }
}) {
  const [audio, setAudio] = useState(() => loadPref('panelSounds') === '1')
  useEffect(() => { soundOn = audio }, [audio])
  const d = new Date(now)
  return (
    <div id="hdr" className="g nofull">
      {/* The beaver, already reduced to panel size (design/booth-es2/make_assets.py writes it from design/logo-source.png). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div id="icon" className="hf"><img src="/booth-es2/common/beaver.png" width={28} height={28} alt="" /></div>
      <div id="brand" className="eng hf">Babson Radio</div>
      <div id="brandsub" className="eng s hf">Studio booth</div>
      <div id="onair" className="lw row px" role="status">On air</div>
      <div id="clock" className="lw row px">
        <span id="clockdate">{d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')}</span>
        <span>{d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      {!browser && LINKS.map(([ic, label], i) => (
        <Btn key={label} id={`lk${i}`} className="lk hf" title={i ? `Open ${label}` : 'Open the web browser'} aria-label={i ? `Open ${label}` : 'Open the web browser'} onClick={() => onLink(i)}>
          <Ic n={ic} /><span className="lbl eng">{label}</span>
        </Btn>
      ))}
      {browser && (
        <>
          <Btn id="bfull" className="splitonly" title="Full screen" aria-label="Full screen" onClick={browser.onLayout}><Ic n="max" /></Btn>
          <Btn id="bclose" className="splitonly" title="Close browser" aria-label="Close browser" onClick={browser.onClose}><Ic n="x" /></Btn>
        </>
      )}
      <Btn id="helpbtn" title="Get help" onClick={onHelp}><Ic n="help" /><span className="lbl">Get help</span></Btn>
      {onSettings && <Btn id="setbtn" title="Settings" onClick={onSettings}><Ic n="gear" /><span className="lbl">Settings</span></Btn>}
      <div className="eng s hf" style={{ left: 878, top: 1 }}>Audio</div>
      <div className="eng s hf" style={{ left: 846, top: 19 }}>Off</div>
      <div className="eng s hf" style={{ left: 920, top: 19 }}>On</div>
      <Sw id="audiosw" lg on={audio} label="Panel sounds" onChange={v => { soundOn = v; setAudio(v); savePref('panelSounds', v ? '1' : '') }} />
      <Led id="audioled" c={audio ? 'green' : ''} />
    </div>
  )
}

/** The plate that drops from the top. `block` dims the panel behind it until it is answered. */
export function Note({ show, led = 'orange', head, body, buttons = [], block }: {
  show: boolean; led?: 'green' | 'orange'; head: string; body: string; buttons?: { label: string; onClick: () => void }[]; block?: boolean
}) {
  return (
    <>
      {show && block && <div id="veil" />}
      <div id="note" data-layer="" className={show ? 'show' : undefined} role="alert" aria-live="assertive">
        <Led id="noteled" c={led} />
        <div id="notetxt" className="lw">
          <span className={`px blk clip ${led === 'orange' ? 'org' : ''}`}>{head}</span>
          <span className="px dim blk clip">{body}</span>
        </div>
        {buttons.slice(0, 2).map((b, i) => <Btn key={b.label} id={`noteb${buttons.length === 1 ? 1 : i}`} onClick={b.onClick}>{b.label}</Btn>)}
        <canvas className="txl" width={500} height={56} />
      </div>
    </>
  )
}

export function Pop({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div id="veil" onClick={onClose} />
      <div className="pop" id={id} data-layer="" role="dialog" aria-label={title}>
        <h2 className="eng">{title}</h2>
        <Btn className="x" title="Close" aria-label="Close" onClick={onClose}><Ic n="x" /></Btn>
        {children}
        <canvas className="txl" width={520} height={330} />
      </div>
    </>
  )
}

const DOCS: readonly [string, string][] = [
  ['Going live', 'Say something into the mic so Mic check ticks, flip Clean music only, then press Go live and wait for On air to light. Press End show when you are done.'],
  ['Loudness', 'Aim for the Sweet spot. The top cells mean too loud: turn the mixer down. If the bar sits low, turn the mixer up or move closer to the mic.'],
  ['Background music', 'Pick a track and it fades in. The Music dial sets how loud the tracks are. Keep them well under your voice. Fade out ends a track gently.'],
  ['Sound board', 'Tap a pad, or press 1 to 8, to fire a sound. Tap it again to stop it. The Effects dial sets how loud the pads are.'],
  ['Studio rules', 'Clean music only. Respect quiet hours. Leave the studio as you found it. Stuck? Message the support group on the sheet by the door.'],
]

export function HelpPop({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  return (
    <Pop id="pop-help" title="Get help" onClose={onClose}>
      {DOCS.map((d, j) => <Btn key={d[0]} id={`doc${j}`} className="docb" on={i === j} onClick={() => setI(j)}><span>{d[0]}</span></Btn>)}
      <div id="docview" className="lw"><b className="px inv">{DOCS[i][0]}</b><span className="px blk">{DOCS[i][1]}</span></div>
    </Pop>
  )
}
