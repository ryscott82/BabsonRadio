import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'

export const runtime = 'nodejs'

// Bells on the schedule. Saved on the account so the website and the app agree; the iOS app turns them
// into on-device notifications 5 minutes before each show.
const KEY = /^(weekly|slot|genre):[A-Za-z0-9 &'._-]{1,80}$/
const MAX = 100

export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const u = await adminDb().collection('users').doc(t.uid).get()
    return { keys: (u.get('reminders') as string[] | undefined) ?? [] }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    const key = str(b.key, 120)
    if (!KEY.test(key) || typeof b.on !== 'boolean') throw new HttpError(400, 'Invalid request.')
    const ref = adminDb().collection('users').doc(t.uid)
    if (b.on) {
      const cur = ((await ref.get()).get('reminders') as string[] | undefined) ?? []
      if (!cur.includes(key) && cur.length >= MAX) throw new HttpError(400, `You can have up to ${MAX} reminders. Turn some off first.`)
    }
    await ref.set({ reminders: b.on ? FieldValue.arrayUnion(key) : FieldValue.arrayRemove(key) }, { merge: true })
    return { ok: true }
  })
}
