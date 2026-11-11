import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember } from '@/lib/server/http'
import { SLOTS, allEmojisFor, emojiRow } from '@/lib/server/liveData'
import { EMOJIS } from '@/lib/server/live'
import { oldPoll } from '@/lib/server/oldRoute'
import { throttled } from '@/lib/server/tierGate'

export const runtime = 'nodejs'

// The reactions this person can use right now: the host's own set for a show that picked one (otherwise the usual ones),
// plus any they have earned (see emojiRow in lib/server/liveData.ts).
//   emojis  everything they can use (the drawer row, and the choices when swapping a key)
//   top     the main row: the keys they chose to hold (reactionSlots), the rest filled with their most used
// (The web page now gets this from /api/live/bundle; this route stays for older app builds.)
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    // Tier 3: the first thing eased off when server time is short (the usual reactions are still on offer). Older apps get the last answer for 5 minutes.
    return throttled('emojis', t.uid, { emojis: [...EMOJIS], top: EMOJIS.slice(0, 5), customized: false }, () => oldPoll('emojis', t.uid, () => emojiRow(adminDb(), t.uid)))
  }, { 'Cache-Control': 'private, max-age=60' })
}

// Swap a key: send the whole main row (up to 5 reactions this person has unlocked). Send an empty list to go back to most used.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const slots = Array.isArray(b.slots) ? b.slots.filter((e): e is string => typeof e === 'string') : []
    const all = await allEmojisFor(adminDb(), t.uid)
    if (slots.length > SLOTS || new Set(slots).size !== slots.length || slots.some(e => !all.includes(e))) {
      throw new HttpError(400, 'Pick reactions you have unlocked.')
    }
    await adminDb().collection('users').doc(t.uid).set({ reactionSlots: slots }, { merge: true })
    return { ok: true, slots }
  })
}
