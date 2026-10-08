import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { EMOJIS } from './live'

// A reaction you earn. Nothing on the site or in the apps says how.
//   🖕 give three one-star ratings (songs or shows, three different ones)
// Kept on the user's doc as earnedEmojis; the one-star list (oneStars) is just the keys of what they rated 1.
export const EARNED_EMOJIS = ['🖕'] as const

/** The usual reactions plus whatever this person has earned. */
export async function emojisFor(db: Firestore, uid: string): Promise<string[]> {
  const got = ((await db.collection('users').doc(uid).get()).get('earnedEmojis') as string[] | undefined) ?? []
  return [...EMOJIS, ...EARNED_EMOJIS.filter(e => got.includes(e))]
}

/** Call after saving a rating. `key` is the song or show that was rated. */
export async function noteStars(db: Firestore, uid: string, key: string, stars: number) {
  const ref = db.collection('users').doc(uid)
  await ref.set({ oneStars: stars === 1 ? FieldValue.arrayUnion(key) : FieldValue.arrayRemove(key) }, { merge: true })
  if (stars !== 1) return
  const n = (((await ref.get()).get('oneStars') as string[] | undefined) ?? []).length
  if (n >= 3) await ref.set({ earnedEmojis: FieldValue.arrayUnion('🖕') }, { merge: true })
}
