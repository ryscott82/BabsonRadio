import 'server-only'
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Set FIREBASE_SERVICE_ACCOUNT_JSON to the (single-line) service account key JSON.
// Firebase console → Project settings → Service accounts → Generate new private key.
function app(): App {
  const existing = getApps()[0]
  if (existing) return existing
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set')
  return initializeApp({ credential: cert(JSON.parse(raw)) })
}

export const adminAuth = () => getAuth(app())
export const adminDb = () => getFirestore(app())
