'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { audioPlaying, readBands } from '@/lib/spectrum'

// Album-color mode for the desk itself (matches the album-art mock-ups): the oak (dark) or silver (light) desk takes the
// cover's colors, and three layers of topographic wood-grain lines pulse with the music. With the real analyser they follow
// the bass / mids / highs; without one (stream without CORS, or nothing playing yet) they keep the mock-up's steady beat.
export default function ArtDesk({ colors, on }: { colors: [string, string, string, string, string, string]; on: boolean }) {
  const host = useSyncExternalStore(() => () => {}, () => document.body, () => null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!on || !host || !el) return
    const lines = Array.from(el.querySelectorAll<HTMLElement>('.ln'))
    const out = new Array<number>(3).fill(0)
    // The lines breathe with the beat, not with the loudness: each layer rises on a hit in its band (bass, mids, highs) and settles
    // back within about a third of a second, with a little of the band's level on top. Steady sound leaves them calm.
    const avg = [0, 0, 0], env = [0, 0, 0], lvl = [0, 0, 0]
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const playing = audioPlaying()
      el.dataset.play = playing ? '1' : '0'
      const real = playing && readBands(out)
      el.dataset.real = real ? '1' : '0'
      if (!real) { lines.forEach(l => { l.style.opacity = ''; l.style.transform = '' }); return }
      lines.forEach((l, i) => {
        avg[i] += (out[i] - avg[i]) * 0.03
        const hit = Math.min(1, Math.max(0, out[i] - avg[i]) * 4.5)
        env[i] = hit > env[i] ? env[i] + (hit - env[i]) * 0.5 : env[i] * 0.93
        lvl[i] += (out[i] - lvl[i]) * 0.08
        l.style.opacity = String(0.3 + 0.55 * env[i] + 0.15 * lvl[i])
        l.style.transform = `scale(${1 + 0.012 * env[i]})`
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on, host])

  if (!host) return null
  const style = { ['--art-1' as string]: colors[0], ['--art-2' as string]: colors[1], ['--art-3' as string]: colors[2], ['--art-4' as string]: colors[3], ['--art-5' as string]: colors[4], ['--art-6' as string]: colors[5] } as React.CSSProperties
  return createPortal(
    <div ref={ref} aria-hidden className="art-desk" data-on={on ? '1' : '0'} data-play="0" data-real="0" style={style}>
      <div className="plate" />
      <div className="tint" />
      <div className="ln ln0" /><div className="ln ln1" /><div className="ln ln2" />
    </div>,
    host,
  )
}
