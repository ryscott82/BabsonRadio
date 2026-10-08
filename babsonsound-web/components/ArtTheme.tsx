'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useNowPlaying } from '@/lib/nowplaying'
import { ART_THEME, BABSON_GREEN, useArtPalette } from '@/lib/artColor'

// Wraps the home page body (not the top bar). Everyone starts on the station green; a few seconds in, the page
// fades to the three main colors of the current cover, one per kind of element (see .art-ui in globals.css).
// Switch it off with ART_THEME = false in lib/artColor.ts.
const FADE_DELAY_MS = 6000

interface Theme { on: boolean; main: string; full: boolean; badge: string }
const Ctx = createContext<Theme>({ on: false, main: '', full: false, badge: '' })
/** The main color to tint the visualizer with ('' when the theme is off or hasn't faded in yet). */
export const useArtMain = () => useContext(Ctx)

/**
 * Light mode is plain cream and green, and dark mode in the daytime is a darker cream with the same green.
 * Only dark mode at night (7pm to 6am) follows the cover's colors everywhere; the On Air badge follows them always.
 */
export function isNightNow() { const h = new Date().getHours(); return h >= 19 || h < 6 }
function useFullColor(): boolean {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const check = () => {
      const t = root.dataset.theme
      const dark = t === 'dark' || (t !== 'light' && mq.matches)
      const night = isNightNow()
      root.dataset.night = night ? '1' : '0'
      setFull(dark && night)
    }
    check()
    const mo = new MutationObserver(check)
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    mq.addEventListener('change', check)
    const iv = setInterval(check, 60_000)
    return () => { mo.disconnect(); mq.removeEventListener('change', check); clearInterval(iv) }
  }, [])
  return full
}

export default function ArtTheme({ className, children }: { className?: string; children: React.ReactNode }) {
  const np = useNowPlaying()
  const palette = useArtPalette(np?.art || undefined)
  const [ready, setReady] = useState(false)
  const night = useFullColor()
  useEffect(() => {
    if (!ART_THEME) return
    const t = setTimeout(() => setReady(true), FADE_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  // The top bar sits outside this wrapper, so mirror the two colors it needs onto the page root while the home page is open.
  const live = night && ready && palette.length === 3
  const rootA = live ? palette[0] : BABSON_GREEN, rootB = live ? palette[1] : BABSON_GREEN
  useEffect(() => {
    if (!ART_THEME || !night) return
    const r = document.documentElement
    r.dataset.art = '1'
    return () => { delete r.dataset.art; r.style.removeProperty('--nav-1'); r.style.removeProperty('--nav-2') }
  }, [night])
  useEffect(() => {
    if (!ART_THEME || !night) return
    const r = document.documentElement
    r.style.setProperty('--nav-1', rootA); r.style.setProperty('--nav-2', rootB)
  }, [rootA, rootB, night])

  if (!ART_THEME) return <div className={className}>{children}</div>
  const ok = ready && palette.length === 3
  const use = night && ok
  const [a, b, c] = use ? palette : [BABSON_GREEN, BABSON_GREEN, BABSON_GREEN]
  const style = { '--art-1': a, '--art-2': b, '--art-3': c } as React.CSSProperties
  return (
    <Ctx.Provider value={{ on: night, main: use ? a : '', full: night, badge: ok ? palette[2] : '' }}>
      <div className={`${night ? 'art-ui ' : ''}${className ?? ''}`} style={night ? style : undefined}>{children}</div>
    </Ctx.Provider>
  )
}
