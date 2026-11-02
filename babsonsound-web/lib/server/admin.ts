import 'server-only'
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getAppCheck } from 'firebase-admin/app-check'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { installReadMeter } from './readMeter'

// Set FIREBASE_SERVICE_ACCOUNT_JSON to the (single-line) service account key JSON.
// Firebase console → Project settings → Service accounts → Generate new private key.
function app(): App {
  const existing = getApps()[0]
  if (existing) return existing
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  // Local emulator run (npm run emulators): no key needed, and nothing here can touch the real project.
  if (!raw && process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-babsonradio' })
  }
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set')
  return initializeApp({ credential: cert(JSON.parse(raw)) })
}

export const adminAuth = () => getAuth(app())
export const adminDb = () => { const db = getFirestore(app()); installReadMeter(db); return db }
export const adminAppCheck = () => getAppCheck(app())

/** Firebase Storage bucket (images). Uses FIREBASE_STORAGE_BUCKET, else the public web config value. */
export const adminBucket = () => {
  const name = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  if (!name) throw new Error('FIREBASE_STORAGE_BUCKET is not set')
  return getStorage(app()).bucket(name)
}
