'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useNowPlaying } from '@/lib/nowplaying'
import { ART_THEME, BABSON_GREEN, useArtPalette } from '@/lib/artColor'
import { getArtTest, onPartyChange, setColorChanging, useParty } from '@/lib/party'

/** Fixed palettes for the admin test switch: [main, green, second]. */
export const ART_PRESETS: Record<string, { label: string; colors: string[] }> = {
  ocean: { label: 'Ocean', colors: ['#2E78C7', '#0B7A5A', '#4FB3D9'] },
  sunset: { label: 'Sunset', colors: ['#E0572F', '#0F7A4B', '#F2A33A'] },
  violet: { label: 'Violet', colors: ['#8A4FD0', '#1E7F5C', '#D05FA8'] },
  gold: { label: 'Gold', colors: ['#D9A21B', '#2E7D32', '#C8602A'] },
  rose: { label: 'Rose', colors: ['#D6456E', '#13785A', '#E8884F'] },
}

// Wraps the home page body (not the top bar). Everyone starts on the station green; a few seconds in, the page
// fades to the three main colors of the current cover, one per kind of element (see .art-ui in globals.css).
// Switch it off with ART_THEME = false in lib/artColor.ts.
const FADE_DELAY_MS = 6000

interface Theme { on: boolean; main: string; full: boolean; badge: string }
const Ctx = createContext<Theme>({ on: false, main: '', full: false, badge: '' })
/** The main color to tint the visualizer with ('' when the theme is off or hasn't faded in yet). */
export const useArtMain = () => useContext(Ctx)

/**
 * The cover colors follow only in party mode (see lib/party.ts); the On Air badge follows them always.
 */

export default function ArtTheme({ className, children }: { className?: string; children: React.ReactNode }) {
  const np = useNowPlaying()
  const coverPalette = useArtPalette(np?.art || undefined)
  const [test, setTest] = useState({ on: false, preset: '' })
  useEffect(() => { const sync = () => setTest(getArtTest()); sync(); return onPartyChange(sync) }, [])
  const palette = test.on && ART_PRESETS[test.preset] ? ART_PRESETS[test.preset].colors : coverPalette
  const [timerReady, setReady] = useState(false)
  const ready = timerReady || test.on
  const night = useParty().party
  const allow = np?.colorChanging === true
  useEffect(() => { setColorChanging(allow) }, [allow])
  useEffect(() => () => setColorChanging(false), [])
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
