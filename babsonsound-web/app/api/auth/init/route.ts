import { handle, readJson, requireUser } from '@/lib/server/http'
import { ensureProfile } from '@/lib/server/profile'
import { accessOf, forgetAccess } from '@/lib/server/access'

export const runtime = 'nodejs'

// Called right after an email-link (or other passwordless) sign-in. Creates the profile if this is their first time.
//   POST { agreed?: boolean, launchNotice?: boolean, firstName?: string }  ->  { ok, created, level }
// The sign-in screen shows "By continuing you agree to the Terms and Privacy Policy", and sends agreed: true.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req).catch(() => ({} as Record<string, unknown>))
    const created = await ensureProfile(t, {
      agreed: b.agreed === true, launchNotice: b.launchNotice === false ? false : undefined,
      firstName: typeof b.firstName === 'string' ? b.firstName : undefined,
    })
    forgetAccess(t.uid)
    return { ok: true, created, level: (await accessOf(t)).level }
  }, { 'Cache-Control': 'no-store' })
}
