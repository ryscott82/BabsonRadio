import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { studioActor } from '@/lib/server/studio'
import { buildRecruits } from '@/lib/server/studioAdmin'

export const runtime = 'nodejs'

// Directors and admins: members who said they want to hear about joining the club.
export async function GET(req: Request) {
  return handle(async () => {
    await studioActor(req, 'staff')
    return { recruits: await buildRecruits(adminDb()) }
  })
}
