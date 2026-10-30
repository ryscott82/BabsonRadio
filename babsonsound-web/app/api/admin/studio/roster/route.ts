import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { studioActor } from '@/lib/server/studio'
import { buildRoster } from '@/lib/server/studioAdmin'

export const runtime = 'nodejs'

// Directors and admins: who is trained, badge, date, trainer, expiry. Filters: ?q= (name or email) &badge=studio|radio
// &status=active|expiring|expired|revoked &trainer=<uid> &sessionId=<id>
export async function GET(req: Request) {
  return handle(async () => {
    await studioActor(req, 'staff')
    const p = new URL(req.url).searchParams
    const rows = await buildRoster(adminDb(), { q: p.get('q') ?? '', badge: p.get('badge') ?? '', status: p.get('status') ?? '', trainer: p.get('trainer') ?? '', sessionId: p.get('sessionId') ?? '' })
    const count = (s: string) => rows.filter(r => r.status === s).length
    return { rows, counts: { active: count('active'), expiring: count('expiring'), expired: count('expired'), revoked: count('revoked'), legacy: rows.filter(r => r.legacy).length } }
  })
}
