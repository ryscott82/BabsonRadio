import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { MAX_REACTIONS, emojisFor } from '@/lib/server/earnedEmojis'
import { EMOJIS, currentOnAir, hostPrefsFor } from '@/lib/server/live'

export const runtime = 'nodejs'

// The reactions this person can use right now: the host's own set for a show that picked one (otherwise the usual ones),
// plus any they have earned.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const db = adminDb()
    const cur = await currentOnAir(db).catch(() => null)
    const mine = cur ? (await hostPrefsFor(db, cur)).emojis : []
    const all = (await emojisFor(db, t.uid, mine.length ? mine : EMOJIS)).slice(0, MAX_REACTIONS)
    // `top` is this person's own most used first (the main screen shows the first 5); `emojis` is the full row for the drawer.
    const use = ((await db.collection('users').doc(t.uid).get()).get('emojiUse') ?? {}) as Record<string, number>
    const top = [...all].sort((a, b) => (use[b] ?? 0) - (use[a] ?? 0))
    return { emojis: all, top }
  })
}
