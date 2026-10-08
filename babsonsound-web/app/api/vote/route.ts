import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { canUseLibrary, requireLibrary } from '@/lib/server/guests'
import { castVote, voteState } from '@/lib/server/votes'

export const runtime = 'nodejs'

// "What would you like to hear": votes for the NEXT hour. Everyone signed in can see the tally;
// students, developers and guests connected to Babson can vote. 15 votes for a genre take the hour over.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const [state, canVote] = await Promise.all([voteState(adminDb(), t.uid), canUseLibrary(t)])
    return { ...state, canVote }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const b = await readJson(req)
    try {
      return { ...(await castVote(adminDb(), t.uid, str(b.genre, 40))), canVote: true }
    } catch (e) {
      if (e instanceof Error && (e as { status?: number }).status === 400) throw new HttpError(400, e.message)
      throw e
    }
  })
}
