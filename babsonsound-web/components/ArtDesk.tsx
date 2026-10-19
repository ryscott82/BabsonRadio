'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { audioPlaying, makeShaper, readBands } from '@/lib/spectrum'

// Album-color mode for the desk itself (matches the album-art mock-ups): the oak (dark) or silver (light) desk takes the
// cover's colors, and three layers of topographic wood-grain lines pulse with the music. With the real analyser they follow
// the bass / mids / highs; without one (stream without CORS, or nothing playing yet) they keep the mock-up's steady beat.
export default function ArtDesk({ colors, on }: { colors: [string, string, string]; on: boolean }) {
  const host = useSyncExternalStore(() => () => {}, () => document.body, () => null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!on || !host || !el) return
    const lines = Array.from(el.querySelectorAll<HTMLElement>('.ln'))
    const out = new Array<number>(3).fill(0)
    const calm = [0, 0, 0]
    const shape = makeShaper(3) // bass, mids (transients only), highs: same shaping as the LED bars
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const playing = audioPlaying()
      el.dataset.play = playing ? '1' : '0'
      const real = playing && readBands(out)
      el.dataset.real = real ? '1' : '0'
      if (!real) { lines.forEach(l => { l.style.opacity = ''; l.style.transform = '' }); return }
      // Calm and smooth: the shaped levels are eased again, move over a narrow range and never snap.
      const { shown, flash } = shape(out)
      lines.forEach((l, i) => {
        calm[i] += (Math.min(1, shown[i] + flash * 0.15) - calm[i]) * (shown[i] > calm[i] ? 0.12 : 0.05)
        l.style.opacity = String(0.35 + 0.5 * calm[i])
        l.style.transform = `scale(${1 + 0.006 * calm[i]})`
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on, host])

  if (!host) return null
  const style = { ['--art-1' as string]: colors[0], ['--art-2' as string]: colors[1], ['--art-3' as string]: colors[2] } as React.CSSProperties
  return createPortal(
    <div ref={ref} aria-hidden className="art-desk" data-on={on ? '1' : '0'} data-play="0" data-real="0" style={style}>
      <div className="plate" />
      <div className="tint" />
      <div className="ln ln0" /><div className="ln ln1" /><div className="ln ln2" />
    </div>,
    host,
  )
}
