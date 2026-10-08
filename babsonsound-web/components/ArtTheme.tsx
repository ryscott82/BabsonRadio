'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useNowPlaying } from '@/lib/nowplaying'
import { ART_THEME, BABSON_GREEN, useArtPalette } from '@/lib/artColor'

// Wraps the home page body (not the top bar). Everyone starts on the station green; a few seconds in, the page
// fades to the three main colors of the current cover, one per kind of element (see .art-ui in globals.css).
// Switch it off with ART_THEME = false in lib/artColor.ts.
const FADE_DELAY_MS = 6000

interface Theme { on: boolean; main: string }
const Ctx = createContext<Theme>({ on: false, main: '' })
/** The main color to tint the visualizer with ('' when the theme is off or hasn't faded in yet). */
export const useArtMain = () => useContext(Ctx)

export default function ArtTheme({ className, children }: { className?: string; children: React.ReactNode }) {
  const np = useNowPlaying()
  const palette = useArtPalette(np?.art || undefined)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!ART_THEME) return
    const t = setTimeout(() => setReady(true), FADE_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  // The top bar sits outside this wrapper, so mirror the two colors it needs onto the page root while the home page is open.
  const live = ready && palette.length === 3
  const rootA = live ? palette[0] : BABSON_GREEN, rootB = live ? palette[1] : BABSON_GREEN
  useEffect(() => {
    if (!ART_THEME) return
    const r = document.documentElement
    r.dataset.art = '1'
    return () => { delete r.dataset.art; r.style.removeProperty('--nav-1'); r.style.removeProperty('--nav-2') }
  }, [])
  useEffect(() => {
    if (!ART_THEME) return
    const r = document.documentElement
    r.style.setProperty('--nav-1', rootA); r.style.setProperty('--nav-2', rootB)
  }, [rootA, rootB])

  if (!ART_THEME) return <div className={className}>{children}</div>
  const use = ready && palette.length === 3
  const [a, b, c] = use ? palette : [BABSON_GREEN, BABSON_GREEN, BABSON_GREEN]
  const style = { '--art-1': a, '--art-2': b, '--art-3': c } as React.CSSProperties
  return (
    <Ctx.Provider value={{ on: true, main: use ? a : '' }}>
      <div className={`art-ui ${className ?? ''}`} style={style}>{children}</div>
    </Ctx.Provider>
  )
}
