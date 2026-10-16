import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { emojisFor } from '@/lib/server/earnedEmojis'
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
    return { emojis: await emojisFor(db, t.uid, mine.length ? mine : EMOJIS) }
  })
}
