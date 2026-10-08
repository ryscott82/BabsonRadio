import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { emojisFor } from '@/lib/server/earnedEmojis'

export const runtime = 'nodejs'

// The reactions this person can use right now (the usual ones plus any they have earned).
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    return { emojis: await emojisFor(adminDb(), t.uid) }
  })
}
