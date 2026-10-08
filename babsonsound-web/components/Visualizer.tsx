'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

// Decorative background for the live player: soft ribbons and glowing orbs that swell with a steady,
// synthetic beat. It is not tied to the audio itself (that would need the stream to allow cross-origin reads),
// so it never affects playback. Tinted with the on-air event's color.

const DEFAULT = '#2fb67c'

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  const n = parseInt((m ? m[1] : DEFAULT.slice(1)), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const css = (c: [number, number, number], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

const subscribe = () => () => {}

/** `inline` draws the canvas where it is placed (used by the full screen board) instead of behind the whole page. */
export default function Visualizer({ color, playing, inline = false, className }: { color: string; playing: boolean; inline?: boolean; className?: string }) {
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
      const light: [number, number, number] = [255, 255, 255] // same as the iOS app: alternate the event color with white
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * (118 / 60))), 5) // ~118 bpm pulse

      ctx!.clearRect(0, 0, w, h)
      ctx!.globalCompositeOperation = 'lighter'

      // glowing orbs drifting slowly
      for (let i = 0; i < 4; i++) {
        const x = w * (0.5 + 0.42 * Math.sin(t * (0.13 + i * 0.05) + i * 2))
        const y = h * (0.5 + 0.35 * Math.cos(t * (0.11 + i * 0.04) + i * 1.3))
        const r = Math.min(w, h) * (0.35 + 0.1 * Math.sin(t * 0.4 + i)) * (1 + beat * 0.12 * energy)
        const g = ctx!.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, css(i % 2 ? light : s.color, 0.20 * (0.5 + energy * 0.5)))
        g.addColorStop(1, css(s.color, 0))
        ctx!.fillStyle = g
        ctx!.fillRect(0, 0, w, h)
      }

      // flowing ribbons
      const bands = 5
      for (let b = 0; b < bands; b++) {
        const base = h * (0.3 + (b / bands) * 0.5)
        const amp = h * (0.05 + 0.1 * energy) * (1 + beat * 0.5 * energy) * (0.6 + b * 0.18)
        const speed = 0.5 + b * 0.17
        ctx!.beginPath()
        ctx!.moveTo(0, h)
        for (let x = 0; x <= w; x += 8) {
          const u = x / w
          const y = base
            + Math.sin(u * 5 + t * speed + b) * amp
            + Math.sin(u * 11 - t * speed * 1.4 + b * 2) * amp * 0.35
          ctx!.lineTo(x, y)
        }
        ctx!.lineTo(w, h)
        ctx!.closePath()
        const g = ctx!.createLinearGradient(0, base - amp, 0, h)
        g.addColorStop(0, css(b % 2 ? light : s.color, 0.14))
        g.addColorStop(1, css(s.color, 0))
        ctx!.fillStyle = g
        ctx!.fill()
      }
      ctx!.globalCompositeOperation = 'source-over'
    }

    if (still) { frame(0); return () => ro.disconnect() }
    let lastDraw = 0
    const loop = (now: number) => { if (!document.hidden && now - lastDraw >= 33) { lastDraw = now; frame(now) } raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [host])

  if (inline) return <canvas ref={ref} aria-hidden className={className ?? 'absolute inset-0 w-full h-full pointer-events-none'} />
  if (!host) return null
  return createPortal(
    <canvas ref={ref} aria-hidden className="fixed inset-0 w-full h-full pointer-events-none z-0 scale-110 opacity-90 blur-[14px]" />,
    host,
  )
}
