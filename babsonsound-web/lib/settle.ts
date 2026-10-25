'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Holds back changes that would resize the page. A value that appears is shown only after it has stayed for `showMs`,
 * and one that goes away is kept on screen for `hideMs` in case it was only a reload. While something is showing, a new value replaces it at once.
 * Use a longer `hideMs` for information that does not need to be exact right now.
 */
export function useHeld<T>(value: T | null | undefined | false, showMs = 1000, hideMs = 3500): T | null {
  const [held, setHeld] = useState<T | null>(null)
  const has = useRef(false)
  useEffect(() => { has.current = held != null }, [held])
  useEffect(() => {
    if (value) {
      if (has.current) { queueMicrotask(() => setHeld(value)); return }
      const t = setTimeout(() => setHeld(value), showMs)
      return () => clearTimeout(t)
    }
    if (!has.current) return
    const t = setTimeout(() => setHeld(null), hideMs)
    return () => clearTimeout(t)
  }, [value, showMs, hideMs])
  return held
}
