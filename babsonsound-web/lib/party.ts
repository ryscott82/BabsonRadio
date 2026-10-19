'use client'

import { useEffect, useState } from 'react'

// The site is plain Babson green. The one exception: at night (7pm to 6am), when the host of the current set (or an admin,
// or the auto-DJ setting) turned on "color-changing background", the album colors take over. ArtTheme feeds that flag in here.

export const isNightNow = () => { const h = new Date().getHours(); return h >= 19 || h < 6 }

const EVT = 'br-party-change'
let allowed = false

// Admin test switch (this browser only): pretends it is night with color-changing on, optionally with a fixed palette.
const TEST_KEY = 'br-art-test'
export interface ArtTest { on: boolean; preset: string }
export function getArtTest(): ArtTest {
  try { const v = JSON.parse(localStorage.getItem(TEST_KEY) || 'null'); if (v && v.on === true) return { on: true, preset: typeof v.preset === 'string' ? v.preset : '' } } catch { /* ignore */ }
  return { on: false, preset: '' }
}
export function setArtTest(t: ArtTest) {
  try { if (t.on) localStorage.setItem(TEST_KEY, JSON.stringify(t)); else localStorage.removeItem(TEST_KEY) } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT))
}
/** Subscribe to party/test changes (used by ArtTheme). */
export function onPartyChange(cb: () => void) { window.addEventListener(EVT, cb); return () => window.removeEventListener(EVT, cb) }

/** Called by ArtTheme with np.colorChanging. */
export function setColorChanging(on: boolean) {
  if (allowed === on) return
  allowed = on
  window.dispatchEvent(new Event(EVT))
}

/** Keeps <html data-night / data-party> in step for the CSS. */
export function partyNow(): { night: boolean; party: boolean } {
  const test = getArtTest().on
  const night = isNightNow() || test
  const party = night && (allowed || test)
  const r = document.documentElement
  r.dataset.night = night ? '1' : '0'
  r.dataset.party = party ? '1' : '0'
  return { night, party }
}

export function useParty(): { night: boolean; party: boolean } {
  const [s, setS] = useState({ night: false, party: false })
  useEffect(() => {
    const check = () => { const n = partyNow(); setS(cur => (cur.night === n.night && cur.party === n.party ? cur : n)) }
    check()
    window.addEventListener(EVT, check)
    const iv = setInterval(check, 60_000)
    return () => { window.removeEventListener(EVT, check); clearInterval(iv) }
  }, [])
  return s
}
