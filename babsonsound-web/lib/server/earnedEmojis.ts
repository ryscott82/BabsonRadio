import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { EMOJIS } from './live'

// A reaction you earn. Nothing on the site or in the apps says how.
//   🖕 give three one-star ratings (songs or shows, three different ones)
//   :br: (the beaver logo) more than 25 engagements: ratings, reactions, votes, likes, skip requests
// Kept on the user's doc as earnedEmojis; the one-star list (oneStars) is just the keys of what they rated 1.
//   ⚡ engage on 3 days in a row      👑 engage on 7 days in a row
//   🎤 host a show                    🌙 engage in the middle of the night (2 to 5am Eastern)  (secret)
export const BEAVER = ':br:'
export const EARNED_EMOJIS = ['⚡', '👑', '🎤', '🌙', '🖕', BEAVER] as const
export const MAX_REACTIONS = 10
const BEAVER_AFTER = 25
const TZ = 'America/New_York'

export interface CatalogItem { emoji: string; name: string; how: string; mystery: boolean; free?: boolean; progress?: number; goal?: number }
/** Everything that can be a reaction. "mystery" ones hide their name and rule until they are earned. */
export const CATALOG: CatalogItem[] = [
  { emoji: '🔥', name: 'Fire', how: 'Everyone starts with this one.', mystery: false, free: true },
  { emoji: '❤️', name: 'Heart', how: 'Everyone starts with this one.', mystery: false, free: true },
  { emoji: '🦫', name: 'Beaver', how: 'Everyone starts with this one.', mystery: false, free: true },
  { emoji: '🤘', name: 'Rock on', how: 'Everyone starts with this one.', mystery: false, free: true },
  { emoji: BEAVER, name: 'Babson Radio', how: 'Take part more than 25 times: reactions, ratings, votes, likes and skip requests all count.', mystery: false, goal: 26 },
  { emoji: '⚡', name: 'On a roll', how: 'Take part on 3 days in a row.', mystery: false, goal: 3 },
  { emoji: '👑', name: 'Royalty', how: 'Take part on 7 days in a row.', mystery: false, goal: 7 },
  { emoji: '🎤', name: 'On the mic', how: 'Host a show on Babson Radio.', mystery: false },
  { emoji: '🌙', name: 'Night owl', how: 'Take part in the middle of the night (2 to 5am Eastern).', mystery: true },
  { emoji: '🖕', name: 'Tough crowd', how: 'Give three different songs or shows one star.', mystery: true },
]

function dayKey(ms: number): string { return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }) }
function hourET(ms: number): number { return Number(new Date(ms).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24 }

export async function award(db: Firestore, uid: string, emoji: string) {
  await db.collection('users').doc(uid).set({ earnedEmojis: FieldValue.arrayUnion(emoji) }, { merge: true })
}

/** The usual reactions plus whatever this person has earned. */
export async function emojisFor(db: Firestore, uid: string, base: readonly string[] = EMOJIS, userDoc?: { get(f: string): unknown }): Promise<string[]> {
  const got = ((userDoc ?? await db.collection('users').doc(uid).get()).get('earnedEmojis') as string[] | undefined) ?? []
  return [...base, ...EARNED_EMOJIS.filter(e => got.includes(e))]
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
    const got = (d.get('earnedEmojis') as string[] | undefined) ?? []
    const add: string[] = []
    if (((d.get('engagements') as number | undefined) ?? 0) > BEAVER_AFTER && !got.includes(BEAVER)) add.push(BEAVER)
    // Day streak (Eastern time)
    const now = Date.now()
    const today = dayKey(now), last = d.get('lastDay') as string | undefined
    let streak = (d.get('streak') as number | undefined) ?? 0
    if (last !== today) {
      streak = last === dayKey(now - 86_400_000) ? streak + 1 : 1
      await ref.set({ lastDay: today, streak }, { merge: true })
    }
    if (streak >= 3 && !got.includes('⚡')) add.push('⚡')
    if (streak >= 7 && !got.includes('👑')) add.push('👑')
    const h = hourET(now)
    if (h >= 2 && h < 5 && !got.includes('🌙')) add.push('🌙')
    if (add.length) await ref.set({ earnedEmojis: FieldValue.arrayUnion(...add) }, { merge: true })
  } catch { /* a missed count is fine */ }
}
