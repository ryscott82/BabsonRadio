'use client'

import { useEffect, useRef, useState } from 'react'
import { micHeard, type LevelState } from '@/lib/booth'

/** A checklist button: an empty box that becomes a tick, then the label. Same look for every item on the go-live checklist. */
export default function CheckButton({ label, checked, onToggle, className = '' }: { label: string; checked: boolean; onToggle: () => void; className?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className={`gbtn h-14 px-4 text-xl flex-1 flex items-center justify-center gap-3 whitespace-nowrap ${className}`}>
      <span className="grid place-items-center h-7 w-7 shrink-0 rounded-md border-2 border-current" aria-hidden>
        {checked && <svg viewBox="0 0 20 20" className="h-5 w-5"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      {label}
    </button>
  )
}

/** Mic check: ticks itself as soon as sound from the mic input reaches the computer; the person can still tick or untick it by hand
 *  (a hand tick stops the automatic one for the rest of the checklist). */
export function useMicCheck(level: LevelState): [boolean, () => void] {
  const [ok, setOk] = useState(false)
  const byHand = useRef(false)
  useEffect(() => { if (!byHand.current && micHeard(level)) queueMicrotask(() => setOk(true)) }, [level])
  return [ok, () => { byHand.current = true; setOk(v => !v) }]
}
