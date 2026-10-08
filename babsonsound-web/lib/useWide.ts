'use client'

import { useSyncExternalStore } from 'react'

/** True on desktop-width windows (1024px and up), where the home page shows two panes. False while rendering on the server. */
export function useWide(): boolean {
  return useSyncExternalStore(
    cb => { const m = window.matchMedia('(min-width: 1024px)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => false,
  )
}
