import { handle, readJson, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { saveStep } from '@/lib/server/setup'

export const runtime = 'nodejs'

// Save one setup step:  POST { step, value }  ->  { ok, setup }
//   name      { firstName, lastName? }
//   avatar    { avatarColor }
//   birthday  { year, month?, day?, parentalConsent? }   (year alone is enough unless it sits on the 13 or 18 line)
//             or { ageRange: 'under13' | '13-17' | '18-24' | '25plus', parentalConsent? }  (for people who would rather not share a birthday)
//   gradYear  { gradYear }                               (students only)
//   phone     { phone }                                  (students only, optional; only when no number is on the account yet)
// The reply carries the updated setup state with next = null: one prompt per visit.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    return { ok: true, setup: await saveStep(t, await accessOf(t), b.step, b.value) }
  }, { 'Cache-Control': 'no-store' })
}
