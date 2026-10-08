'use client'

import { useEffect, useState } from 'react'

// Party mode: the full album colors, available at night (7pm to 6am). The rest of the time, and whenever party mode is
// off, the site keeps its calm vintage cream look (darker cream in dark mode).
// Until someone taps the party hat, party mode follows the browser: on when it asks for dark mode, off for light.

export const isNightNow = () => { const h = new Date().getHours(); return h >= 19 || h < 6 }

const KEY = 'br-party'
const EVT = 'br-party-change'

function effectiveDark(): boolean {
  const t = document.documentElement.dataset.theme
  return t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
}
function stored(): boolean | null {
  try { const v = localStorage.getItem(KEY); return v === 'on' ? true : v === 'off' ? false : null } catch { return null }
}

/** Is the party look on right now? (Only ever true at night.) Also keeps <html data-night / data-party> in step for the CSS. */
export function partyNow(): { night: boolean; party: boolean } {
  const night = isNightNow()
  const pref = stored()
  const party = night && (pref ?? effectiveDark())
  const r = document.documentElement
  r.dataset.night = night ? '1' : '0'
  r.dataset.party = party ? '1' : '0'
  return { night, party }
}

export function setParty(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch {}
  window.dispatchEvent(new Event(EVT))
}

export function useParty(): { night: boolean; party: boolean } {
  const [s, setS] = useState({ night: false, party: false })
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const check = () => { const n = partyNow(); setS(cur => (cur.night === n.night && cur.party === n.party ? cur : n)) }
    check()
    const mo = new MutationObserver(check)
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    mq.addEventListener('change', check)
    window.addEventListener(EVT, check)
    const iv = setInterval(check, 60_000)
    return () => { mo.disconnect(); mq.removeEventListener('change', check); window.removeEventListener(EVT, check); clearInterval(iv) }
  }, [])
  return s
}
