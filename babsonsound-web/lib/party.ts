'use client'

import { useEffect, useState } from 'react'

// The site is plain Babson green. The one exception: at night (7pm to 6am), when the host of the current set (or an admin,
// or the auto-DJ setting) turned on "color-changing background", the album colors take over. ArtTheme feeds that flag in here.

export const isNightNow = () => { const h = new Date().getHours(); return h >= 19 || h < 6 }

const EVT = 'br-party-change'
let allowed = false

/** Called by ArtTheme with np.colorChanging. */
export function setColorChanging(on: boolean) {
  if (allowed === on) return
  allowed = on
  window.dispatchEvent(new Event(EVT))
}

/** Keeps <html data-night / data-party> in step for the CSS. */
export function partyNow(): { night: boolean; party: boolean } {
  const night = isNightNow()
  const party = night && allowed
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
