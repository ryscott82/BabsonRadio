import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { after } from 'next/server'
import { notifyAdmins } from '@/lib/server/push'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { hostContext } from '@/lib/server/host'
import { checkImageRef } from '@/lib/server/images'

export const runtime = 'nodejs'

// A host asks to change their weekly show's name, description or picture. Always allowed (no time window);
// staff approve it in Admin → Show updates, and the live schedule changes then.
export async function POST(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const c = await hostContext(req, db)
    const b = await readJson(req)
    const scheduleId = str(b.scheduleId, 100)
    const show = await db.collection('schedule').doc(scheduleId).get()
    if (!scheduleId || !show.exists || !(show.get('hostUids') ?? []).includes(c.t.uid)) {
      throw new HttpError(403, "You aren't a host of that show.", 'BR-HST-002')
    }
    const showName = str(b.showName, 80)
    const description = str(b.description, 600)
    const img = b.imageUrl ? checkImageRef(c.t.uid, b.imageUrl, b.imagePath) : null
    if (b.imageUrl && !img) throw new HttpError(400, 'That picture could not be used. Upload it again.')
    if (!showName && !description && !img) throw new HttpError(400, 'Change at least one thing.')

    const mine = (await db.collection('showUpdates').where('requestedBy', '==', c.t.uid).get()).docs
      .filter(d => d.get('status') === 'pending')
    if (mine.length >= 3) throw new HttpError(429, 'You have 3 requests waiting. Staff will review them soon.')

    const user = await db.collection('users').doc(c.t.uid).get()
    const ref = await db.collection('showUpdates').add({
      scheduleId, showTitle: show.get('showName') ?? '', requestedBy: c.t.uid,
      requesterName: user.get('firstName') ?? user.get('displayName') ?? '',
      showName, description, imageUrl: img?.imageUrl ?? '', imagePath: img?.imagePath ?? '',
      status: 'pending', createdAt: Timestamp.now(),
    })
    after(() => notifyAdmins('requests', { title: 'Show change requested', body: `${user.get('firstName') ?? 'A host'} wants to change ${show.get('showName') ?? 'their show'}` }, c.t.uid))
    return { id: ref.id }
  })
}
