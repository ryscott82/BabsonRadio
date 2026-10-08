import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, isDeveloperToken, readJson, requireUser, str } from '@/lib/server/http'
import { USER_KINDS, cleanKinds, saveDevice, type PushKind } from '@/lib/server/push'

export const runtime = 'nodejs'

// This phone's personal notification choices: the happy-birthday message and station announcements.
// Only those two kinds are touched here; an admin's other notification choices on the same phone are kept.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const token = str(new URL(req.url).searchParams.get('token'), 400)
    const d = token ? await adminDb().collection('deviceTokens').doc(token).get() : null
    const kinds = d?.exists && d.get('uid') === t.uid ? cleanKinds(d.get('kinds')) : []
    return { birthday: kinds.includes('birthday'), announcements: kinds.includes('announcements') }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    const token = str(b.token, 400)
    if (token.length < 20 || token.includes('/')) throw new HttpError(400, 'Invalid device.')
    const prev = await adminDb().collection('deviceTokens').doc(token).get()
    const old = prev.exists && prev.get('uid') === t.uid ? cleanKinds(prev.get('kinds')) : []
    const next = new Set<PushKind>(old)
    for (const k of USER_KINDS) if (typeof b[k] === 'boolean') { if (b[k]) next.add(k); else next.delete(k) }
    await saveDevice(t.uid, token, [...next], isDeveloperToken(t))
    return { birthday: next.has('birthday'), announcements: next.has('announcements') }
  })
}
