'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { readBands } from '@/lib/spectrum'

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
    const out = new Array<number>(6).fill(0), avg = [0, 0, 0], shown = [0, 0, 0]
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const a = document.querySelector('audio')
      const playing = !!a && !a.paused
      el.dataset.play = playing ? '1' : '0'
      const real = playing && readBands(out)
      el.dataset.real = real ? '1' : '0'
      lines.forEach((l, i) => {
        if (!real) { l.style.opacity = ''; l.style.transform = ''; return }
        const raw = (out[i * 2] + out[i * 2 + 1]) / 2
        avg[i] += (raw - avg[i]) * 0.04
        const target = Math.max(0, Math.min(1, raw * 1.1 + (raw - avg[i]) * 2.2))
        const atk = Math.min(1, 0.08 + Math.max(0, raw - avg[i]) * 7) // loud bursts jump, soft sounds ease in
        shown[i] = target > shown[i] ? shown[i] + (target - shown[i]) * atk : Math.max(target, shown[i] * 0.82)
        l.style.opacity = String(0.3 + 0.7 * shown[i])
        l.style.transform = `scale(${1 + 0.015 * shown[i]})`
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
