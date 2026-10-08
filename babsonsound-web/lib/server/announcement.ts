import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'

// A message for the whole audience, pushed live from the station controls. It shows as a banner on every page of the
// website and at the top of the live screen in the app, until it expires or an admin clears it.

export interface Announcement { text: string; updatedAt: number; until: number }

const REF = ['config', 'announcement'] as const
let cache: { at: number; v: Announcement | null } | null = null

export async function getAnnouncement(db: Firestore, now = Date.now()): Promise<Announcement | null> {
  if (cache && now - cache.at < 5_000) return cache.v
  const d = await db.collection(REF[0]).doc(REF[1]).get()
  const until = (d.get('until') as Timestamp | undefined)?.toMillis() ?? 0
  const text = String(d.get('text') ?? '')
  const v = d.exists && text && until > now ? { text, until, updatedAt: (d.get('updatedAt') as Timestamp).toMillis() } : null
  cache = { at: now, v }
  return v
}

export async function setAnnouncement(db: Firestore, text: string, minutes: number, uid: string) {
  const now = Date.now()
  const clean = text.trim().slice(0, 240)
  const ref = db.collection(REF[0]).doc(REF[1])
  if (!clean) await ref.set({ text: '', until: Timestamp.fromMillis(0), updatedAt: Timestamp.fromMillis(now), by: uid })
  else await ref.set({ text: clean, until: Timestamp.fromMillis(now + Math.min(720, Math.max(1, minutes)) * 60_000), updatedAt: Timestamp.fromMillis(now), by: uid })
  cache = null
}
