'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import EmojiGlyph from '@/components/EmojiGlyph'

// Emojis that fall from the top of the screen. Call rain('🔥', 5) from anywhere; mount <EmojiRain /> once on the page.
interface P { id: number; e: string; left: number; dur: number; delay: number; size: number; dx: number; rot: number }
const EVT = 'br-rain'
let nextId = 1

export function rain(e: string, count = 1, spreadMs = 0) {
  if (typeof window === 'undefined') return
  // On the full screen board (a screen on the wall) the drops are bigger and each reaction is a little shower.
  const wall = document.body.dataset.board === '1' || !!document.fullscreenElement
  const n = wall ? Math.max(count, 3) : count
  const list: P[] = Array.from({ length: n }, () => ({
    id: nextId++, e, left: 4 + Math.random() * 92, dur: 2600 + Math.random() * 1800,
    delay: spreadMs ? Math.random() * spreadMs : Math.random() * 350,
    size: (26 + Math.random() * 20) * (wall ? 2 : 1), dx: (Math.random() - 0.5) * 80, rot: (Math.random() - 0.5) * 120,
  }))
  window.dispatchEvent(new CustomEvent<P[]>(EVT, { detail: list }))
}

/** A burst of 4 or 5, for when you tap a reaction. */
export const rainBurst = (e: string) => rain(e, 4 + (Math.random() < 0.5 ? 0 : 1))

const noop = () => () => {}

export default function EmojiRain() {
  const [ps, setPs] = useState<P[]>([])
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  // In full screen only the full-screen element is drawn, so the rain has to live inside it.
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => {
    const sync = () => setHost(document.fullscreenElement)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const on = (ev: Event) => {
      if (reduce) return
      const add = (ev as CustomEvent<P[]>).detail
      setPs(cur => [...cur, ...add].slice(-150))
    }
    window.addEventListener(EVT, on)
    return () => window.removeEventListener(EVT, on)
  }, [])
  if (!mounted) return null
  return createPortal(
    <div aria-hidden className="fixed inset-0 z-[150] pointer-events-none overflow-hidden">
      {ps.map(p => (
        <span key={p.id} className="br-rain-drop"
              onAnimationEnd={() => setPs(cur => cur.filter(x => x.id !== p.id))}
              style={{ left: `${p.left}%`, fontSize: p.size, animationDuration: `${p.dur}ms`, animationDelay: `${p.delay}ms`,
                       ['--dx' as string]: `${p.dx}px`, ['--rot' as string]: `${p.rot}deg` }}><EmojiGlyph e={p.e} size={p.size * 1.15} /></span>
      ))}
    </div>,
    host ?? document.body,
  )
}
