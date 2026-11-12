import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { str } from './http'
import { nameLower } from '../studioBookCore'

/** Keeps the lowercase name used for the guest type-ahead (users.nameLower) in step with first and last name. One small read, a write only when it changed. */
export async function syncNameLower(db: Firestore, uid: string): Promise<void> {
  const ref = db.collection('users').doc(uid)
  const d = await ref.get()
  if (!d.exists) return
  const v = nameLower(d.get('firstName'), d.get('lastName'))
  if (d.get('nameLower') !== v) await ref.update({ nameLower: v })
}

/**
 * The name to show next to something a person sent (a song request, a playlist request): the first name saved on their profile.
 * Never the sign-in token's `name`: anyone can set that from the client SDK, and it skips the word filter.
 */
export async function firstNameOf(db: Firestore, uid: string, fallback = 'Listener'): Promise<string> {
  const d = await db.collection('users').doc(uid).get()
  return str(d.get('firstName') ?? d.get('displayName'), 60) || fallback
}
