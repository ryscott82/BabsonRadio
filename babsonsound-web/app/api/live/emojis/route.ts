import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember } from '@/lib/server/http'
import { MAX_REACTIONS, emojisFor } from '@/lib/server/earnedEmojis'
import { EMOJIS, currentOnAir, hostPrefsFor } from '@/lib/server/live'

export const runtime = 'nodejs'

/** Keys on the main reaction row. */
const SLOTS = 5

async function allFor(uid: string, userDoc?: { get(f: string): unknown }) {
  const db = adminDb()
  const cur = await currentOnAir(db).catch(() => null)
  const mine = cur ? (await hostPrefsFor(db, cur)).emojis : []
  return (await emojisFor(db, uid, mine.length ? mine : EMOJIS, userDoc)).slice(0, MAX_REACTIONS)
}

// The reactions this person can use right now: the host's own set for a show that picked one (otherwise the usual ones),
// plus any they have earned.
//   emojis  everything they can use (the drawer row, and the choices when swapping a key)
//   top     the main row: the keys they chose to hold (reactionSlots), the rest filled with their most used
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const d = await adminDb().collection('users').doc(t.uid).get() // one read of the user doc, shared with the earned-emoji lookup
    const all = await allFor(t.uid, d)
    const use = (d.get('emojiUse') ?? {}) as Record<string, number>
    const byUse = [...all].sort((a, b) => (use[b] ?? 0) - (use[a] ?? 0))
    const saved = ((d.get('reactionSlots') as string[] | undefined) ?? []).slice(0, SLOTS)
    const taken = new Set<string>()
    const row: (string | null)[] = saved.map(e => (all.includes(e) && !taken.has(e) ? (taken.add(e), e) : null))
    const fill = byUse.filter(e => !taken.has(e))
    const top = row.map(e => e ?? fill.shift() ?? null).filter((e): e is string => !!e)
    if (!saved.length) top.splice(0, top.length, ...byUse)
    return { emojis: all, top, customized: saved.length > 0 }
  })
}

// Swap a key: send the whole main row (up to 5 reactions this person has unlocked). Send an empty list to go back to most used.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const slots = Array.isArray(b.slots) ? b.slots.filter((e): e is string => typeof e === 'string') : []
    const all = await allFor(t.uid)
    if (slots.length > SLOTS || new Set(slots).size !== slots.length || slots.some(e => !all.includes(e))) {
      throw new HttpError(400, 'Pick reactions you have unlocked.')
    }
    await adminDb().collection('users').doc(t.uid).set({ reactionSlots: slots }, { merge: true })
    return { ok: true, slots }
  })
}
