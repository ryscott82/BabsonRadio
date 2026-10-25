// First-visit splash for signed-out visitors. Remembered in this browser only: no accounts, no server calls.
const KEY = 'br-splash-seen'
const COOKIE = 'br_splash'

export function splashSeen(): boolean {
  try { if (localStorage.getItem(KEY) === '1') return true } catch { /* storage blocked: use the cookie */ }
  return document.cookie.split('; ').some(c => c === `${COOKIE}=1`)
}

export function markSplashSeen() {
  try { localStorage.setItem(KEY, '1'); return } catch { /* storage blocked: use the cookie */ }
  document.cookie = `${COOKIE}=1; max-age=31536000; path=/; SameSite=Lax`
}

// "Try it out" asks the live player to start. The tap is the one browsers need before audio can play.
let pendingTry = false
export function requestTryIt() { pendingTry = true; window.dispatchEvent(new Event('br:try-it')) }
export function takeTryIt() { const p = pendingTry; pendingTry = false; return p }
