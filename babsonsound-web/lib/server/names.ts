import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { str } from './http'

/**
 * The name to show next to something a person sent (a song request, a playlist request): the first name saved on their profile.
 * Never the sign-in token's `name`: anyone can set that from the client SDK, and it skips the word filter.
 */
export async function firstNameOf(db: Firestore, uid: string, fallback = 'Listener'): Promise<string> {
  const d = await db.collection('users').doc(uid).get()
  return str(d.get('firstName') ?? d.get('displayName'), 60) || fallback
}
