import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'

// Maintenance mode (Admin > Controls): while on, what is playing reads "Babson Radio will be back shortly" on the website and in the app,
// with no song, artist, art or show shown. Off by default. It changes what listeners see; stopping the audio itself is the Emergency stop.
export const MAINTENANCE_TITLE = 'Babson Radio will be back shortly'

const REF = ['config', 'maintenance'] as const
let cache: { at: number; v: boolean } | null = null

export async function getMaintenance(db: Firestore, now = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < 5_000) return cache.v
  const d = await db.collection(REF[0]).doc(REF[1]).get()
  const v = d.exists && d.get('on') === true
  cache = { at: now, v }
  return v
}

export async function setMaintenance(db: Firestore, on: boolean, uid: string) {
  await db.collection(REF[0]).doc(REF[1]).set({ on, by: uid, updatedAt: Date.now() })
  cache = null
}
