import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { EMOJIS } from './live'

// A reaction you earn. Nothing on the site or in the apps says how.
//   🖕 give three one-star ratings (songs or shows, three different ones)
//   :br: (the beaver logo) more than 25 engagements: ratings, reactions, votes, likes, skip requests
// Kept on the user's doc as earnedEmojis; the one-star list (oneStars) is just the keys of what they rated 1.
export const BEAVER = ':br:'
export const EARNED_EMOJIS = ['🖕', BEAVER] as const
const BEAVER_AFTER = 25

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

/** Count one engagement (a rating, reaction, vote, like or skip request). Past 25 the beaver unlocks. Never throws. */
export async function bump(db: Firestore, uid: string) {
  try {
    const ref = db.collection('users').doc(uid)
    await ref.set({ engagements: FieldValue.increment(1) }, { merge: true })
    const d = await ref.get()
    if (((d.get('engagements') as number | undefined) ?? 0) > BEAVER_AFTER && !((d.get('earnedEmojis') as string[] | undefined) ?? []).includes(BEAVER)) {
      await ref.set({ earnedEmojis: FieldValue.arrayUnion(BEAVER) }, { merge: true })
    }
  } catch { /* a missed count is fine */ }
}
