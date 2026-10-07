import { handle, HttpError, isDeveloperToken, requireUser } from '@/lib/server/http'
import { prelaunchToken } from '@/lib/prelaunch'
import { isTester } from '@/lib/server/testers'

export const runtime = 'nodejs'

// A signed-in beta tester (or developer) trades their Firebase sign-in for the pre-launch pass, so the
// site and the app open for them without sharing the developer password.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if (!isDeveloperToken(t) && !(await isTester(t.email))) {
      throw new HttpError(403, 'Babson Radio is invite-only until launch. Ask the station to add your email.', 'BR-PRE-002')
    }
    const pw = process.env.PRELAUNCH_PASSWORD
    if (!pw) throw new HttpError(503, 'Pre-launch access is not configured.', 'BR-PRE-001')
    return { gate: await prelaunchToken(pw) }
  })
}
