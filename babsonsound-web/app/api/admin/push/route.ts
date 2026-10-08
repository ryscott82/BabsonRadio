import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, isDeveloperToken, readJson, requireStaff, str } from '@/lib/server/http'
import { PUSH_KINDS, cleanKinds, saveDevice } from '@/lib/server/push'

export const runtime = 'nodejs'

// This phone's notification choices. The app sends its Firebase messaging token and which kinds it wants.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const token = str(new URL(req.url).searchParams.get('token'), 400)
    const d = token ? await adminDb().collection('deviceTokens').doc(token).get() : null
    return { kinds: d?.exists && d.get('uid') === t.uid ? cleanKinds(d.get('kinds')) : [], all: PUSH_KINDS }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    const token = str(b.token, 400)
    if (token.length < 20 || token.includes('/')) throw new HttpError(400, 'Invalid device.')
    const kinds = cleanKinds(b.kinds)
    await saveDevice(t.uid, token, kinds, isDeveloperToken(t))
    return { kinds }
  })
}
