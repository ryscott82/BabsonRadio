import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser } from '@/lib/server/http'
import { patchPrefs, readPrefs } from '@/lib/reminders'

export const runtime = 'nodejs'

// Reminder settings for hosts' show and studio-booking reminders (email and push, which ones). Stored on the user as showReminders
// (users.reminders is the older list of schedule bells). Everything is on until the person turns it off.
//   GET    -> { email, push, dayBefore, hourBefore, bookingQuarter }
//   PATCH  { any of those fields as true/false } -> the new settings
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    return readPrefs((await adminDb().collection('users').doc(t.uid).get()).get('showReminders'))
  }, { 'Cache-Control': 'private, no-store' })
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const ref = adminDb().collection('users').doc(t.uid)
    const r = patchPrefs(readPrefs((await ref.get()).get('showReminders')), await readJson(req))
    if (!r.ok) throw new HttpError(400, r.message, 'BR-REM-001')
    await ref.set({ showReminders: r.prefs }, { merge: true })
    return r.prefs
  }, { 'Cache-Control': 'private, no-store' })
}
