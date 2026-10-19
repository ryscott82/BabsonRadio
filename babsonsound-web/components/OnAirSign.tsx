'use client'

import { useEffect, useRef } from 'react'
import { useArtMain } from '@/components/ArtTheme'
import { audioPlaying, readBands } from '@/lib/spectrum'

/** The ON AIR sign. In album-color mode its lamp flickers a little with the bass while music plays (brighter on each hit, a touch dimmer between). */
export default function OnAirSign() {
  const ref = useRef<HTMLSpanElement>(null)
  const { main } = useArtMain()
  const art = !!main
  useEffect(() => {
    const el = ref.current
    if (!art || !el) return
    const out = [0, 0, 0, 0, 0, 0], avg = [0], env = [0]
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      if (!audioPlaying() || !readBands(out)) { el.style.removeProperty('--fl'); delete el.dataset.fl; return }
      const bass = Math.max(out[0], out[1], out[2]) // lowest bands
      avg[0] += (bass - avg[0]) * 0.04
      const hit = Math.min(1, Math.max(0, bass - avg[0]) * 4)
      env[0] = hit > env[0] ? env[0] + (hit - env[0]) * 0.6 : env[0] * 0.88
      el.dataset.fl = '1'; el.style.setProperty('--fl', Math.min(1, env[0] * 0.8).toFixed(3)) // brighter on each beat, at rest a touch dimmer
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); el.style.removeProperty('--fl'); delete el.dataset.fl }
  }, [art])
  return <div className="hw-sign" role="img" aria-label="On air"><span ref={ref}>ON AIR</span></div>
}
