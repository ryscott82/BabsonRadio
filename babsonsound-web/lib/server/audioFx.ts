import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'

// Station-wide switch for the browser's audio processing (the real equalizer reading and the volume boost). On by default.
// When it is off, the website plays the stream straight through the browser's normal player, with nothing in the sound path.

const REF = ['config', 'audioFx'] as const
let cache: { at: number; v: boolean } | null = null

export async function getAudioFx(db: Firestore, now = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < 15_000) return cache.v
  const d = await db.collection(REF[0]).doc(REF[1]).get()
  const v = !(d.exists && d.get('on') === false)
  cache = { at: now, v }
  return v
}

export async function setAudioFx(db: Firestore, on: boolean, uid: string) {
  await db.collection(REF[0]).doc(REF[1]).set({ on, by: uid, updatedAt: Date.now() })
  cache = null
}
