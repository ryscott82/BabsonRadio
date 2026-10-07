'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

// Decorative background for the live player: soft ribbons and glowing orbs that swell with a steady,
// synthetic beat. It is not tied to the audio itself (that would need the stream to allow cross-origin reads),
// so it never affects playback. Tinted with the on-air event's color.

const DEFAULT = '#e8b84a'

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  const n = parseInt((m ? m[1] : DEFAULT.slice(1)), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
function hsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return [0, 0, l]
  const sat = d / (1 - Math.abs(2 * l - 1))
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, sat, l]
}
function fromHsl(h: number, sat: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}
// Colors that sit well together: the album color plus analogous and split-complement neighbours.
const OFFSETS = [0, 28, -32, 150, 210, 60]
function palette(base: [number, number, number]) {
  const [h, sat, l] = hsl(base)
  const sa = Math.min(0.85, Math.max(0.5, sat)), li = Math.min(0.68, Math.max(0.5, l))
  return OFFSETS.map((o, i) => fromHsl(h + o, sa, li + (i % 2 ? 0.06 : -0.02)))
}
// Each wave gets its own speed, height and roughness (0 = silky, 1 = jagged).
const WAVES = [
  { rough: 0.0, speed: 0.45, amp: 1.0, y: 0.35, step: 10 },
  { rough: 0.25, speed: 0.7, amp: 0.8, y: 0.45, step: 8 },
  { rough: 0.9, speed: 1.1, amp: 0.45, y: 0.55, step: 6 },
  { rough: 0.05, speed: 0.3, amp: 1.3, y: 0.65, step: 12 },
  { rough: 0.55, speed: 0.9, amp: 0.65, y: 0.75, step: 6 },
  { rough: 1.0, speed: 1.4, amp: 0.3, y: 0.85, step: 5 },
]
const css = (c: [number, number, number], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

const subscribe = () => () => {}

export default function Visualizer({ color, playing }: { color: string; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // Full viewport, behind everything, so it spans the whole page rather than one panel.
  const host = useSyncExternalStore(subscribe, () => document.body, () => null)
  const live = useRef({ color: rgb(color || DEFAULT), target: rgb(color || DEFAULT), playing })

  useEffect(() => { live.current.target = rgb(color || DEFAULT); live.current.playing = playing }, [color, playing])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, raf = 0, energy = 0.25
    const t0 = performance.now()
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      w = r.width; h = r.height
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const ro = new ResizeObserver(() => { resize(); if (still) frame(0) })
    ro.observe(canvas)
    resize()

    function frame(now: number) {
      const s = live.current
      const t = (now - t0) / 1000
      s.color = mix(s.color, s.target, 0.04)            // fade between event colors
      energy += ((s.playing ? 1 : 0.25) - energy) * 0.03 // calm when paused, lively when playing
      const pal0 = palette(s.color)
      const light = pal0[1]
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * (118 / 60))), 5) // ~118 bpm pulse

      ctx!.clearRect(0, 0, w, h)
      ctx!.globalCompositeOperation = 'lighter'

      // glowing orbs drifting slowly
      for (let i = 0; i < 4; i++) {
        const x = w * (0.5 + 0.42 * Math.sin(t * (0.13 + i * 0.05) + i * 2))
        const y = h * (0.5 + 0.35 * Math.cos(t * (0.11 + i * 0.04) + i * 1.3))
        const r = Math.min(w, h) * (0.35 + 0.1 * Math.sin(t * 0.4 + i)) * (1 + beat * 0.12 * energy)
        const g = ctx!.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, css(i % 2 ? light : s.color, 0.22 * (0.5 + energy * 0.5)))
        g.addColorStop(1, css(s.color, 0))
        ctx!.fillStyle = g
        ctx!.fillRect(0, 0, w, h)
      }

      // layered waves, each its own color, speed and smoothness
      const pal = palette(s.color)
      WAVES.forEach((wv, b) => {
        const col = pal[b % pal.length]
        const base = h * wv.y
        const amp = h * (0.04 + 0.08 * energy) * wv.amp * (1 + beat * 0.5 * energy)
        const pts: number[] = []
        for (let x = 0; x <= w + wv.step; x += wv.step) {
          const u = x / w
          pts.push(base
            + Math.sin(u * 4 + t * wv.speed + b * 1.7) * amp
            + Math.sin(u * 9 - t * wv.speed * 1.3 + b) * amp * 0.3
            + wv.rough * (Math.sin(u * 37 + t * wv.speed * 3 + b) * amp * 0.35 + Math.sin(u * 71 - t * wv.speed * 4.1) * amp * 0.2))
        }
        ctx!.beginPath()
        ctx!.moveTo(0, h)
        pts.forEach((y, i) => ctx!.lineTo(i * wv.step, y))
        ctx!.lineTo(w + wv.step, h)
        ctx!.closePath()
        const g = ctx!.createLinearGradient(0, base - amp, 0, h)
        g.addColorStop(0, css(col, 0.14))
        g.addColorStop(1, css(col, 0))
        ctx!.fillStyle = g
        ctx!.fill()
        ctx!.beginPath()
        pts.forEach((y, i) => (i ? ctx!.lineTo(i * wv.step, y) : ctx!.moveTo(0, y)))
        ctx!.strokeStyle = css(col, 0.45)
        ctx!.lineWidth = 1.5
        ctx!.stroke()
      })
      ctx!.globalCompositeOperation = 'source-over'
    }

    if (still) { frame(0); return () => ro.disconnect() }
    const loop = (now: number) => { if (!document.hidden) frame(now); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [host])

  if (!host) return null
  return createPortal(
    <canvas ref={ref} aria-hidden className="fixed inset-0 w-full h-full pointer-events-none -z-10 opacity-90" />,
    host,
  )
}
