'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * A title that never gets cut off: it may wrap to `lines` rows, and if it still does not fit the font shrinks
 * (down to `min` of its normal size) until it does. Set the normal size and line-height with className.
 * `reserve` keeps room for the full number of rows (text sits at the bottom) so the layout does not jump between songs.
 */
export default function FitTitle({ text, className = '', lines = 2, min = 0.15, reserve = false, as: Tag = 'h2' }: {
  text: string; className?: string; lines?: number; min?: number; reserve?: boolean; as?: 'h1' | 'h2' | 'p' | 'div'
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const el = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const t = el.current, b = box.current
    if (!t || !b) return
    const fit = () => {
      t.style.fontSize = ''
      t.style.setProperty('-webkit-line-clamp', 'none') // measure the whole text, then clamp again afterwards
      const base = parseFloat(getComputedStyle(t).fontSize)
      const lh = parseFloat(getComputedStyle(t).lineHeight) / base || 1.1
      let size = base
      const over = () => t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > size * lh * lines + 1
      let guard = 0
      while (over() && size > Math.max(base * min, 12) && guard++ < 90) { size *= 0.95; t.style.fontSize = `${size}px` }
      t.style.removeProperty('-webkit-line-clamp')
      if (reserve) b.style.minHeight = `${size * lh * lines}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(b)
    return () => ro.disconnect()
  }, [text, lines, min, reserve])

  const T = Tag as 'h2'
  return (
    <div ref={box} className={reserve ? 'flex flex-col justify-end' : undefined}>
      <T ref={el as React.RefObject<HTMLHeadingElement>} title={text} className={`${className} hw-fit`} style={{ ['--fit-lines' as string]: lines }}>{text}</T>
    </div>
  )
}
