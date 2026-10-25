'use client'

import { useEffect, useState } from 'react'

/** Covers from another server are read through our own copy (/api/art), because the radio server doesn't allow cross-origin reads. */
export function artSrc(url: string): string {
  try { if (new URL(url, location.href).origin !== location.origin) return `/api/art?u=${encodeURIComponent(url)}` } catch { /* ignore */ }
  return url
}

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
    img.src = artSrc(url)
    return () => { alive = false }
  }, [url])
  return url && state.url === url ? state.color : ''
}

// ── Three-color palette from the cover, used to tint the home page (see components/ArtTheme.tsx) ──────────────
/** One switch for the whole album-color theme. Set to false and the page goes back to the plain green look. */
export const ART_THEME = true

/** Official Babson Green (Pantone 3425 C). Every element of the home page starts here. */
export const BABSON_GREEN = '#006644'

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
 * [main color, paired green, second color] from a cover. Gray, near-black/white and face-colored pixels from the
 * center are skipped. Each color is nudged to a middle brightness so it reads on both the light and dark themes.
 * Returns [] while loading or when the picture can't be read.
 */
/** The fallback green when the cover has none: a green that sits well next to its main hue: warm covers get emerald, yellows leaf green, greens a deep Babson-like green, blues sea green, purples a fresher green. */
export function pairedGreen(h: number): string {
  const g = h >= 345 || h < 45 ? 152 : h < 75 ? 125 : h < 165 ? 158 : h < 255 ? 150 : 138
  return hexOf(g, 0.72, 0.31)
}

/**
 * Palette from the pixels of a cover (N x N RGBA): [main, paired accent, second, ...up to three more real colors].
 * It goes color hunting: face-colored pixels count much less (and not at all in the middle), so a portrait doesn't turn into
 * just skin tone, and a smaller color (a blue hat, a red eye) still makes the list when it's a real part of the picture.
 */
export function paletteFromPixels(px: ArrayLike<number>, N: number): string[] {
  const BINS = 24
  const bins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0, n: 0 }))
  let count = 0, lum = 0
  for (let i = 0; i < px.length; i += 4) {
    const p = i / 4, col = p % N, row = Math.floor(p / N)
    const [h, s, l] = hslOf(px[i], px[i + 1], px[i + 2])
    lum += l
    if (s < 0.16 || l < 0.1 || l > 0.92) continue
    let w = s * (1 - Math.abs(2 * l - 1)) + 0.01
    if (skinLike(h, s, l)) {
      const center = col >= N * 0.25 && col < N * 0.75 && row >= N * 0.2 && row < N * 0.8
      if (center) continue
      w *= 0.3
    }
    const b = bins[Math.floor(h / (360 / BINS)) % BINS]
    b.n++; count++
    b.w += w; b.x += Math.cos((h * Math.PI) / 180) * w; b.y += Math.sin((h * Math.PI) / 180) * w; b.s += s * w; b.l += l * w
  }
  // Black and white, gray or nearly colorless covers get a quiet graphite palette (a faint cool tint), never a stock green and never a made-up color.
  if (count / (N * N) < 0.06) {
    const mid = Math.max(0.4, Math.min(0.58, lum / (N * N) + 0.05))
    return [hexOf(215, 0.06, mid), hexOf(215, 0.06, Math.max(0.3, mid - 0.12)), hexOf(215, 0.05, Math.max(0.28, mid - 0.2)), hexOf(215, 0.05, Math.min(0.66, mid + 0.1)), hexOf(215, 0.04, Math.max(0.3, mid - 0.08)), hexOf(215, 0.04, Math.max(0.3, mid - 0.16))]
  }
  const ranked = bins.filter(b => b.w > 0).sort((a, b) => b.w - a.w)
    .map(b => ({ h: ((Math.atan2(b.y, b.x) * 180) / Math.PI + 360) % 360, s: b.s / b.w, l: b.l / b.w, w: b.w, n: b.n }))
  if (!ranked.length) return []
  const total = ranked.reduce((a, r) => a + r.w, 0)
  const picked: { h: number; s: number; l: number; w: number; n: number }[] = []
  for (const r of ranked) {
    if (picked.length === 5) break
    // Another color counts when it's a real share of the picture: at least 2.5% of the colored pixels (even if they are pale or small, like a blue hat),
    // enough of a tint to read as that color, and at least 4% as much weight as the main one.
    if (picked.length && (r.n / count < 0.025 || r.s < 0.2 || r.w < ranked[0].w * 0.04)) continue
    if (picked.every(p => hueGap(p.h, r.h) >= 38)) picked.push(r)
  }
  // Covers with a single real color get one close neighbour, so there is always a second shade.
  if (picked.length === 1) picked.push({ ...picked[0], h: (picked[0].h + 14) % 360 })
  // Side colors stay a bit quieter than the main one.
  const covers = picked.map((p, i) => hexOf(p.h, Math.max(0.28, Math.min(i ? 0.48 : 0.6, p.s * 0.72)), Math.max(0.34, Math.min(0.62, p.l))))
  // Accent: the cover's own green when it has a real amount of one, else a lighter shade of the main color (never an unrelated green).
  const own = ranked.find(r => r.h >= 75 && r.h <= 170 && r.w / total >= 0.1)
  const green = own ? hexOf(own.h, Math.max(0.3, Math.min(0.55, own.s * 0.75)), 0.31) : hexOf(picked[0].h, Math.max(0.3, Math.min(0.55, picked[0].s * 0.7)), 0.4)
  return [covers[0], green, covers[1], ...covers.slice(2)]
}

export function useArtPalette(url: string | undefined): string[] {
  const [state, setState] = useState<{ url: string; colors: string[] }>({ url: '', colors: [] })
  useEffect(() => {
    if (!url || !ART_THEME) return
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const N = 48
        const c = document.createElement('canvas')
        c.width = c.height = N
        const g = c.getContext('2d', { willReadFrequently: true })!
        g.drawImage(img, 0, 0, N, N)
        const colors = paletteFromPixels(g.getImageData(0, 0, N, N).data, N)
        if (alive) setState({ url, colors })
      } catch { if (alive) setState({ url, colors: [] }) }
    }
    img.onerror = () => { if (alive) setState({ url, colors: [] }) }
    img.src = artSrc(url)
    return () => { alive = false }
  }, [url])
  return ART_THEME && url && state.url === url ? state.colors : []
}
