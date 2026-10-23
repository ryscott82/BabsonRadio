import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireAdmin } from '@/lib/server/http'
import { preview, sendChunk, sendTest } from '@/lib/server/launchEmail'

export const runtime = 'nodejs'
export const maxDuration = 60

// Admin only. { action: 'preview' | 'test' | 'send' }
//   preview  counts: { total, verified, unverified, unsubscribed, bySchool, verifiedBySchool, alreadySent, eligible } (optedOut = unsubscribed)
//   test     one copy to the signed-in admin
//   send     mails the next chunk (about 25 people) and returns { sent, failed, remaining, done }; the page calls it until done.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    const db = adminDb()
    switch (b.action) {
      case 'preview': return preview(db)
      case 'test': return sendTest(t.uid, t.email)
      case 'send': return sendChunk(db)
      default: throw new HttpError(400, 'action must be preview, test or send.')
    }
  }, { 'Cache-Control': 'no-store' })
}
