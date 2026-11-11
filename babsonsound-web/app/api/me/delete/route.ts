import { deleteAccountData } from '@/lib/server/deleteAccount'
import { HttpError, handle, readJson, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { DEMO_DELETE_MESSAGE } from '@/lib/demoAccount'

export const runtime = 'nodejs'

// Permanently deletes the caller's account and their data. Requires a fresh sign-in
// (the apps ask for the password first) and { confirm: "DELETE" }.
// The hidden App Review demo account is never deleted: it answers 200 { ok: true, kept: true, message } and nothing changes.
// The apps should show `message` and stay signed in when `kept` is true.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if ((await readJson(req)).confirm !== 'DELETE') throw new HttpError(400, 'Confirmation missing.')
    if ((await accessOf(t)).demo) return { ok: true, kept: true, message: DEMO_DELETE_MESSAGE }
    if (!t.auth_time || t.auth_time < Date.now() / 1000 - 300) {
      throw new HttpError(401, 'Please sign in again to delete your account.')
    }

    await deleteAccountData(t.uid)
    return { ok: true }
  })
}
