import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, signInWithCustomToken } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { log } from './log.mjs'

// The PC signs in as uid "studio-worker" with a custom token from /api/worker/token (no service-account key on the PC).
// Firestore rules refuse a sign-in older than about 65 minutes, so it signs in again every 50 minutes.

const RESIGN_MS = 50 * 60_000

export function makeFirebase(cfg, site) {
  const app = initializeApp({ ...cfg.firebase, ...(cfg.firebase.authDomain ? {} : { authDomain: `${cfg.firebase.projectId}.firebaseapp.com` }) }, 'pc-worker')
  const auth = initializeAuth(app, { persistence: inMemoryPersistence })
  const db = getFirestore(app)
  if (cfg.emulators.auth) connectAuthEmulator(auth, `http://${cfg.emulators.auth}`, { disableWarnings: true })
  if (cfg.emulators.firestore) { const [h, p] = cfg.emulators.firestore.split(':'); connectFirestoreEmulator(db, h, Number(p)) }

  let timer = null, listeners = []
  async function signIn() {
    const { token } = await site.token()
    await signInWithCustomToken(auth, token)
    log.info('Signed in as the studio worker.')
    clearTimeout(timer)
    timer = setTimeout(() => keepSignedIn().catch(() => {}), RESIGN_MS)
    for (const f of listeners) f()
  }
  async function keepSignedIn() {
    for (let wait = 30_000; ; wait = Math.min(wait * 2, 10 * 60_000)) {
      try { return await signIn() } catch (e) { log.warn(`Sign-in failed (${e.message}). Trying again in ${Math.round(wait / 1000)} s.`) ; await new Promise(r => setTimeout(r, wait)) }
    }
  }
  return {
    app, auth, db,
    signIn: keepSignedIn,
    /** Called after every fresh sign-in (listeners are re-attached then). */
    onSignedIn: f => listeners.push(f),
    idToken: () => (auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve('')),
    stop: () => clearTimeout(timer),
  }
}
