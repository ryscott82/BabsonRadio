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
