import { initializeApp, getApps } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export const auth    = getAuth(app)
export const db      = getFirestore(app)
export const storage = getStorage(app)

// Local testing only: NEXT_PUBLIC_USE_EMULATORS=1 in .env.local points the site at the Firebase emulators (npm run emulators),
// whose accounts and data live in memory and vanish when they stop. Ignored anywhere but localhost, so it can never reach the real database.
if (process.env.NEXT_PUBLIC_USE_EMULATORS === '1' && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  const g = globalThis as { __brEmu?: boolean }
  if (!g.__brEmu) {
    g.__brEmu = true
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
}
