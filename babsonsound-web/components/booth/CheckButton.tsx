'use client'

import { useEffect, useRef, useState } from 'react'
import { micHeard, type LevelState } from '@/lib/booth'

/** Mic check: ticks itself as soon as sound from the mic input reaches the computer; the person can still tick or untick it by hand
 *  (a hand tick stops the automatic one for the rest of the checklist). */
export function useMicCheck(level: LevelState): [boolean, () => void] {
  const [ok, setOk] = useState(false)
  const byHand = useRef(false)
  useEffect(() => { if (!byHand.current && micHeard(level)) queueMicrotask(() => setOk(true)) }, [level])
  return [ok, () => { byHand.current = true; setOk(v => !v) }]
}
