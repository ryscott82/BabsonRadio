// Browser-safe constants and helpers (lib/prelaunch.ts reads env, so keep the cookie name in sync with it).
export const PRELAUNCH_COOKIE = 'br_pre_s'
// Per-tab markers (sessionStorage): they disappear when the tab closes, and a refresh clears them on purpose.
export const TAB_GATE = 'br-pre-gate'
export const TAB_TOKEN = 'br-pre-token'

const safe = (fn: () => void) => { try { fn() } catch { /* storage can be blocked */ } }

/** Remember the unlock for this tab only. */
export function rememberUnlock(gate: string, customToken: string | null) {
  document.cookie = `${PRELAUNCH_COOKIE}=${gate}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  safe(() => {
    sessionStorage.setItem(TAB_GATE, '1')
    if (customToken) sessionStorage.setItem(TAB_TOKEN, customToken)
  })
}

export function forgetUnlock() {
  document.cookie = `${PRELAUNCH_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  safe(() => { sessionStorage.removeItem(TAB_GATE); sessionStorage.removeItem(TAB_TOKEN) })
}

/** True when this page load is a browser refresh. */
export function isReload(): boolean {
  try { return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload' }
  catch { return false }
}

export function tabUnlocked(): boolean {
  try { return sessionStorage.getItem(TAB_GATE) === '1' } catch { return false }
}

export const hasUnlockCookie = () => document.cookie.split('; ').some(c => c.startsWith(`${PRELAUNCH_COOKIE}=`))
