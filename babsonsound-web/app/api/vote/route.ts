import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { bump } from '@/lib/server/earnedEmojis'
import { canUseLibrary, requireLibrary } from '@/lib/server/guests'
import { castVote, voteState } from '@/lib/server/votes'
import { requestsStatus } from '@/lib/server/live'
import { forgetOld, oldPoll } from '@/lib/server/oldRoute'
import { throttled } from '@/lib/server/tierGate'
import { publishNow } from '@/lib/server/liveStateTick'

export const runtime = 'nodejs'

// What a throttled or switched-off vote card answers: no choices on offer, never an error.
const EMPTY = { blockStart: 0, blockEnd: 0, threshold: 3, options: [], myVote: null, winner: null, upNext: null, canVote: false, requestsOpen: false, requestsShow: '' }

// "What would you like to hear": votes for the NEXT hour. Everyone signed in can see the tally;
// students, developers and guests connected to Babson can vote. Voting for an hour closes 1 minute before it starts; the genre with the most votes (at least 3, no tie) takes it.
// Older apps poll the GET: one person asking again within 45 s gets the last answer (lib/server/oldRoute.ts). The web page reads the bundle and liveState.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    return throttled('vote', t.uid, EMPTY, () => oldPoll('vote', t.uid, async () => {
      const [state, canVote, rq] = await Promise.all([voteState(adminDb(), t.uid), canUseLibrary(t), requestsStatus(adminDb())])
      return { ...state, canVote, requestsOpen: rq.open, requestsShow: rq.showTitle }
    }))
  }, { 'Cache-Control': 'private, no-store' })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const b = await readJson(req)
    return throttled('vote', t.uid, EMPTY, async () => {
      try {
        const rq = await requestsStatus(adminDb())
        const voted = await castVote(adminDb(), t.uid, str(b.genre, 40))
        await bump(adminDb(), t.uid)
        forgetOld('vote', t.uid)
        after(() => publishNow(adminDb()).then(() => undefined).catch(() => {})) // the new tally goes to everyone's page
        return { ...voted, canVote: true, requestsOpen: rq.open, requestsShow: rq.showTitle }
      } catch (e) {
        if (e instanceof Error && (e as { status?: number }).status === 400) throw new HttpError(400, e.message)
        throw e
      }
    }, 'w')
  })
}
