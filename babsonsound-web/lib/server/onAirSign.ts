import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'

// A manual switch for the ON AIR sign (admin dashboard): shows the sign for everyone even when no live show is detected. Off by default.

const REF = ['config', 'onAirSign'] as const
let cache: { at: number; v: boolean } | null = null

export async function getOnAirSign(db: Firestore, now = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < 15_000) return cache.v
  const d = await db.collection(REF[0]).doc(REF[1]).get()
  const v = d.exists && d.get('on') === true
  cache = { at: now, v }
  return v
}

export async function setOnAirSign(db: Firestore, on: boolean, uid: string) {
  await db.collection(REF[0]).doc(REF[1]).set({ on, by: uid, updatedAt: Date.now() })
  cache = null
}
