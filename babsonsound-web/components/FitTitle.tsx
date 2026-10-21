'use client'

import { useLayoutEffect, useRef, useState } from 'react'

/** Marquee speed in pixels per second, and the blank gap between the end of the title and its repeat. */
const MARQUEE_PX_PER_S = 45
const MARQUEE_GAP_EM = 2.5
/** A title is first fitted onto `lines` rows, shrinking at most to this fraction of its normal size. Still too long: it scrolls. */
const MARQUEE_MIN_SCALE = 0.8

/**
 * A title that never gets cut off. It may wrap to `lines` rows, and shrinks a little (down to `min` of its normal size) to fit.
 * With `marquee`, a title that still does not fit in `lines` rows at 80% size is shown on one line that scrolls sideways, like other music
 * apps, so the whole title goes past (the page's reduced-motion setting keeps it still and shrinks it instead).
 * Set the normal size and line-height with className. `reserve` keeps room for the full number of rows (text sits at the bottom)
 * so the layout does not jump between songs.
 */
export default function FitTitle({ text, className = '', lines = 2, min = 0.15, reserve = false, marquee = false, as: Tag = 'h2' }: {
  text: string; className?: string; lines?: number; min?: number; reserve?: boolean; marquee?: boolean; as?: 'h1' | 'h2' | 'p' | 'div'
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const el = useRef<HTMLElement | null>(null)
  const run = useRef<HTMLSpanElement | null>(null)
  const [scroll, setScroll] = useState(false)

  useLayoutEffect(() => {
    const t = el.current, b = box.current
    if (!t || !b) return
    const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fit = () => {
      t.style.fontSize = ''
      t.style.setProperty('-webkit-line-clamp', 'none') // measure the whole text, then clamp again afterwards
      const base = parseFloat(getComputedStyle(t).fontSize)
      const lh = parseFloat(getComputedStyle(t).lineHeight) / base || 1.1
      let size = base
      const over = () => t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > size * lh * lines + 1
      const floor = marquee && !still ? base * MARQUEE_MIN_SCALE : Math.max(base * min, 12)
      let guard = 0
      while (over() && size > floor && guard++ < 90) { size *= 0.95; t.style.fontSize = `${size}px` }
      const tooLong = over()   // measured before the line clamp is put back
      t.style.removeProperty('-webkit-line-clamp')
      if (marquee && !still && tooLong) {
        // Still does not fit: normal size, one line, scrolling (the plain copy stays in place, invisible, so it can be measured again).
        t.style.fontSize = ''
        setScroll(true)
        if (reserve) b.style.minHeight = `${base * lh}px`
        return
      }
      setScroll(false)
      if (reserve) b.style.minHeight = `${size * lh * lines}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(b)
    return () => ro.disconnect()
  }, [text, lines, min, reserve, marquee])

  // Once the scrolling markup is in place, measure one copy of the title and set the loop length and duration.
  useLayoutEffect(() => {
    const t = el.current, r = run.current
    if (!scroll || !t || !r) return
    const track = r.parentElement as HTMLElement
    const dist = r.getBoundingClientRect().width + parseFloat(getComputedStyle(t).fontSize) * MARQUEE_GAP_EM
    track.style.setProperty('--mq-dist', `${dist}px`)
    track.style.setProperty('--mq-dur', `${(dist / MARQUEE_PX_PER_S).toFixed(2)}s`)
  }, [scroll, text])

  const T = Tag as 'h2'
  return (
    <div ref={box} className={`relative${reserve ? ' flex flex-col justify-end' : ''}`}>
      <T ref={el as React.RefObject<HTMLHeadingElement>} title={text} className={`${className} hw-fit`}
         style={{ ['--fit-lines' as string]: lines, visibility: scroll ? 'hidden' : undefined }}>{text}</T>
      {scroll && (
        <T className={`${className} hw-fit hw-mq`} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} aria-label={text}>
          <span className="hw-mq-track" aria-hidden>
            <span ref={run}>{text}</span>
            <span>{text}</span>
          </span>
        </T>
      )}
    </div>
  )
}
