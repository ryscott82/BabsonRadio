import 'server-only'
import { createLastKnown } from '../lastKnown'

// Older iOS builds still ask the old routes on their own timers, as fast as they always did. Each person asking again inside the gap below
// gets the answer this server gave them last, with no Firestore work, so those apps cost very little. (Signed-in requests cannot be cached by
// Vercel's edge, so this is the saving that is possible for them: a short function run instead of a full one.) Per server instance.
export const OLD_GAP_MS = { presence: 60_000, skip: 30_000, vote: 45_000, setlist: 30_000, rating: 60_000, emojis: 300_000, host: 300_000 } as const
export type OldRoute = keyof typeof OLD_GAP_MS

const memory = createLastKnown<unknown>(5000)

export async function oldPoll<T>(route: OldRoute, uid: string, work: () => Promise<T>): Promise<T> {
  const key = `${route}:${uid}`
  const hit = memory.recall(key, OLD_GAP_MS[route])
  if (hit !== undefined) return hit as T
  const v = await work()
  memory.remember(key, v)
  return v
}

/** Call after the person's own action (a vote, a star) so their next read shows it. */
export const forgetOld = (route: OldRoute, uid: string) => memory.forget(`${route}:${uid}`)
