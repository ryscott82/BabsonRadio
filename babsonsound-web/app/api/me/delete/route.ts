import { deleteAccountData } from '@/lib/server/deleteAccount'
import { HttpError, handle, readJson, requireUser } from '@/lib/server/http'

export const runtime = 'nodejs'

// Permanently deletes the caller's account and their data. Requires a fresh sign-in
// (the apps ask for the password first) and { confirm: "DELETE" }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if ((await readJson(req)).confirm !== 'DELETE') throw new HttpError(400, 'Confirmation missing.')
    if (!t.auth_time || t.auth_time < Date.now() / 1000 - 300) {
      throw new HttpError(401, 'Please sign in again to delete your account.')
    }

    await deleteAccountData(t.uid)
    return { ok: true }
  })
}
