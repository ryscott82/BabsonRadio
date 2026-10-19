'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { useNowPlaying } from '@/lib/nowplaying'
import { ART_THEME, BABSON_GREEN, useArtPalette } from '@/lib/artColor'
import dynamic from 'next/dynamic'
const ArtDesk = dynamic(() => import('@/components/ArtDesk'), { ssr: false })
import { getArtTest, onPartyChange, setColorChanging, useParty } from '@/lib/party'

/** Fixed palettes for the admin test switch: [main, green, second]. */
export const ART_PRESETS: Record<string, { label: string; colors: string[] }> = {
  ocean: { label: 'Ocean', colors: ['#2E78C7', '#3B8FDD', '#4FB3D9'] },
  sunset: { label: 'Sunset', colors: ['#E0572F', '#E8703F', '#F2A33A'] },
  violet: { label: 'Violet', colors: ['#8A4FD0', '#9D68DC', '#D05FA8'] },
  gold: { label: 'Gold', colors: ['#D9A21B', '#E2B13A', '#C8602A'] },
  lime: { label: 'Acid green', colors: ['#8ACE00', '#9BD626', '#F2E94E'] },
  rose: { label: 'Rose', colors: ['#D6456E', '#E0587F', '#E8884F'] },
}

// Wraps the home page body (not the top bar). Everyone starts on the station green; a few seconds in, the page
// fades to the three main colors of the current cover, one per kind of element (see .art-ui in globals.css).
// Switch it off with ART_THEME = false in lib/artColor.ts.

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
  useEffect(() => { if (ART_THEME) queueMicrotask(() => setReady(true)) }, [])

  // The top bar sits outside this wrapper, so mirror the two colors it needs onto the page root while the home page is open.
  const live = night && ready && palette.length >= 3
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

  const ok = ready && palette.length >= 3
  const use = night && ok
  // The first time the cover colors switch on they appear at once (no slow fade up from green); later song changes still glide.
  useLayoutEffect(() => {
    if (!use) return
    const r = document.documentElement
    r.dataset.artSnap = '1'
    const t = setTimeout(() => { delete r.dataset.artSnap }, 400)
    return () => clearTimeout(t)
  }, [use])
  if (!ART_THEME) return <div className={className}>{children}</div>
  const [a, b, c] = use ? palette : [BABSON_GREEN, BABSON_GREEN, BABSON_GREEN]
  // Up to three more real cover colors for the desk; when the cover has fewer, they repeat the ones it has.
  const d = use && palette[3] ? palette[3] : c, e = use && palette[4] ? palette[4] : a, f = use && palette[5] ? palette[5] : c
  const style = { '--art-1': a, '--art-2': b, '--art-3': c } as React.CSSProperties
  return (
    <Ctx.Provider value={{ on: night, main: use ? a : '', full: night, badge: ok ? palette[2] : '' }}>
      <div className={`${night ? 'art-ui ' : ''}${className ?? ''}`} style={night ? style : undefined}>{children}</div>
      {night && <ArtDesk colors={[a, b, c, d, e, f]} on={use} />}
    </Ctx.Provider>
  )
}
