import { handle, readJson, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { saveStep } from '@/lib/server/setup'

export const runtime = 'nodejs'

// Save one setup step:  POST { step, value }  ->  { ok, setup }
//   name      { firstName, lastName? }
//   avatar    { avatarColor }
//   birthday  { year, month?, day?, parentalConsent? }   (year alone is enough unless it sits on the 13 or 18 line)
//   gradYear  { gradYear }                               (students only)
//   phone     { phone }                                  (students only; only when no number is on the account yet. A number another member uses is allowed.)
// The reply carries the updated setup state; next is the following step to ask about.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    return { ok: true, setup: await saveStep(t, await accessOf(t), b.step, b.value) }
  }, { 'Cache-Control': 'no-store' })
}
