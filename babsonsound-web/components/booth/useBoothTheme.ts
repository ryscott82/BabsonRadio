'use client'

import { useCallback, useState } from 'react'
import { nextThemeSwitch, themeNow } from '@/lib/booth'
import { loadPref, savePref } from './helper'

type Force = { night: boolean; until: number }

function readForce(): Force | null {
  try {
    const v = JSON.parse(loadPref('theme', 'null')) as Force | null
    return v && typeof v.night === 'boolean' && typeof v.until === 'number' ? v : null
  } catch { return null }
}

/** Day or night for the booth panel. Automatic (night 7 pm to 7 am), or forced from the panel until the next automatic switch. */
export function useBoothTheme(now: number) {
  const [force, setForce] = useState<Force | null>(readForce)
  const night = themeNow(now, force)
  const toggle = useCallback(() => {
    const t = Date.now()
    const next: Force = { night: !themeNow(t, force), until: nextThemeSwitch(t) }
    setForce(next); savePref('theme', JSON.stringify(next))
  }, [force])
  return { night, toggle }
}
