'use client'

import { themeNow } from '@/lib/booth'

/** Day or night for the booth panel: automatic only (pure black from 7 pm to 7 am). There is no switch on the panel. */
export function useBoothTheme(now: number) {
  return { night: themeNow(now, null) }
}
