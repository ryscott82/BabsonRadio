'use client'

import { useEffect, useState } from 'react'

/**
 * A vivid color pulled from a cover image ("#rrggbb"), or '' when the image can't be read
 * (the picture's server must allow cross-origin reads; if it doesn't we quietly fall back).
 */
export function useArtColor(url: string | undefined): string {
  const [state, setState] = useState<{ url: string; color: string }>({ url: '', color: '' })
  useEffect(() => {
    if (!url) return
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 24
        const g = c.getContext('2d', { willReadFrequently: true })!
        g.drawImage(img, 0, 0, 24, 24)
        const px = g.getImageData(0, 0, 24, 24).data
        let r = 0, gr = 0, b = 0, wsum = 0
        for (let i = 0; i < px.length; i += 4) {
          const R = px[i], G = px[i + 1], B = px[i + 2]
          const max = Math.max(R, G, B), min = Math.min(R, G, B)
          const sat = max === 0 ? 0 : (max - min) / max
          const w = sat * sat * (max / 255) + 0.001 // favor colorful, bright pixels over grey and black
          r += R * w; gr += G * w; b += B * w; wsum += w
        }
        let out: [number, number, number] = [r / wsum, gr / wsum, b / wsum]
        const peak = Math.max(...out)
        if (peak < 150 && peak > 0) out = out.map(v => Math.min(255, v * (150 / peak))) as [number, number, number] // keep it bright enough to glow
        const hex = '#' + out.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
        if (alive) setState({ url, color: hex })
      } catch { if (alive) setState({ url, color: '' }) }
    }
    img.onerror = () => { if (alive) setState({ url, color: '' }) }
    img.src = url
    return () => { alive = false }
  }, [url])
  return url && state.url === url ? state.color : ''
}

// ── Three-color palette from the cover, used to tint the home page (see components/ArtTheme.tsx) ──────────────
/** One switch for the whole album-color theme. Set to false and the page goes back to the plain green look. */
export const ART_THEME = true

const GREEN = '#2fb67c'

function hslOf(R: number, G: number, B: number): [number, number, number] {
  const r = R / 255, g = G / 255, b = B / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
function hexOf(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
}
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

/** Skin-tone-like pixel (warm hue, medium saturation and lightness): ignored in the middle of the picture, where faces tend to be. */
function skinLike(h: number, s: number, l: number) { return h >= 5 && h <= 45 && s >= 0.15 && s <= 0.7 && l >= 0.2 && l <= 0.8 }

/**
 * The three main colors of a cover as hex, most common first. Gray, near-black/white and face-colored pixels from the
 * center are skipped. Each color is nudged to a middle brightness so it reads on both the light and dark themes.
 * Returns [] while loading or when the picture can't be read.
 */
export function useArtPalette(url: string | undefined): string[] {
  const [state, setState] = useState<{ url: string; colors: string[] }>({ url: '', colors: [] })
  useEffect(() => {
    if (!url || !ART_THEME) return
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const N = 40
        const c = document.createElement('canvas')
        c.width = c.height = N
        const g = c.getContext('2d', { willReadFrequently: true })!
        g.drawImage(img, 0, 0, N, N)
        const px = g.getImageData(0, 0, N, N).data
        const BINS = 12
        const bins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }))
        for (let i = 0; i < px.length; i += 4) {
          const p = i / 4, col = p % N, row = Math.floor(p / N)
          const [h, s, l] = hslOf(px[i], px[i + 1], px[i + 2])
          if (s < 0.2 || l < 0.12 || l > 0.9) continue
          const center = col >= N * 0.25 && col < N * 0.75 && row >= N * 0.2 && row < N * 0.8
          if (center && skinLike(h, s, l)) continue
          const w = s * (1 - Math.abs(2 * l - 1)) + 0.01
          const b = bins[Math.floor(h / (360 / BINS)) % BINS]
          b.w += w; b.x += Math.cos((h * Math.PI) / 180) * w; b.y += Math.sin((h * Math.PI) / 180) * w; b.s += s * w; b.l += l * w
        }
        const ranked = bins.filter(b => b.w > 0).sort((a, b) => b.w - a.w)
          .map(b => ({ h: ((Math.atan2(b.y, b.x) * 180) / Math.PI + 360) % 360, s: b.s / b.w, l: b.l / b.w, w: b.w }))
        const picked: { h: number; s: number; l: number }[] = []
        for (const r of ranked) {
          if (picked.length === 3) break
          if (picked.every(p => hueGap(p.h, r.h) >= 40)) picked.push(r)
        }
        // Covers with fewer than three real colors: fill with shifted versions of the first.
        while (picked.length && picked.length < 3) {
          const base = picked[0]
          picked.push({ h: (base.h + (picked.length === 1 ? 35 : -35) + 360) % 360, s: base.s, l: base.l })
        }
        const colors = picked.map(p => hexOf(p.h, Math.max(0.45, Math.min(0.85, p.s)), Math.max(0.42, Math.min(0.58, p.l))))
        if (alive) setState({ url, colors })
      } catch { if (alive) setState({ url, colors: [] }) }
    }
    img.onerror = () => { if (alive) setState({ url, colors: [] }) }
    img.src = url
    return () => { alive = false }
  }, [url])
  return ART_THEME && url && state.url === url ? state.colors : []
}

export const STATION_GREEN = GREEN
