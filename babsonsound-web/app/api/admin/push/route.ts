import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { PUSH_KINDS, USER_KINDS, cleanKinds, saveDevice, type PushKind } from '@/lib/server/push'

export const runtime = 'nodejs'

// This phone's notification choices. The app sends its Firebase messaging token and which kinds it wants.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const token = str(new URL(req.url).searchParams.get('token'), 400)
    const d = token ? await adminDb().collection('deviceTokens').doc(token).get() : null
    return { kinds: d?.exists && d.get('uid') === t.uid ? cleanKinds(d.get('kinds')).filter(k => !USER_KINDS.includes(k)) : [], all: PUSH_KINDS.filter(k => !USER_KINDS.includes(k)) }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    const token = str(b.token, 400)
    if (token.length < 20 || token.includes('/')) throw new HttpError(400, 'Invalid device.')
    let kinds: PushKind[] = cleanKinds(b.kinds).filter(k => !USER_KINDS.includes(k))
    // Birthday and announcement notifications are the person's own choice (set from their profile); keep them if they were on.
    const prev = await adminDb().collection('deviceTokens').doc(token).get()
    if (prev.exists && prev.get('uid') === t.uid) kinds = [...kinds, ...cleanKinds(prev.get('kinds')).filter(k => USER_KINDS.includes(k))]
    await saveDevice(t.uid, token, kinds, false)
    return { kinds: kinds.filter(k => !USER_KINDS.includes(k)) }
  })
}
