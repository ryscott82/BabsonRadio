import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { parseClock } from '@/lib/autoschedule'
import { checkImageRef, deleteImage } from '@/lib/server/images'

export const runtime = 'nodejs'

// Weekly recurring shows (the `schedule` collection). Staff only.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const snap = await adminDb().collection('schedule').get()
    const shows = snap.docs.map(d => ({
      id: d.id, showName: d.get('showName') ?? '', dayOfWeek: d.get('dayOfWeek') ?? 0,
      startTime: d.get('startTime') ?? '', endTime: d.get('endTime') ?? '',
      description: d.get('description') ?? '', hostNames: d.get('hostNames') ?? [], category: d.get('category') ?? '',
      imageUrl: d.get('imageUrl') ?? '', imagePath: d.get('imagePath') ?? '', showSlug: d.get('showSlug') ?? '',
      isActive: d.get('isActive') !== false,
    })).sort((a, b) => a.dayOfWeek - b.dayOfWeek || String(a.startTime).localeCompare(String(b.startTime)))
    return { shows }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    const db = adminDb()

    if (b.action === 'delete') {
      const ref = db.collection('schedule').doc(str(b.id, 100))
      const old = await ref.get()
      if (old.exists) { await deleteImage(old.get('imagePath')); await ref.delete() }
      return { ok: true }
    }

    const showName = str(b.showName, 80)
    const dayOfWeek = Number(b.dayOfWeek)
    const start = parseClock(str(b.startTime, 10)), end = parseClock(str(b.endTime, 10))
    if (!showName) throw new HttpError(400, 'Give the show a name.')
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new HttpError(400, 'Pick a day.')
    if (start === null || end === null || end <= start) throw new HttpError(400, 'Pick a start time and an end time after it.')
    const hostNames = (Array.isArray(b.hostNames) ? b.hostNames : []).map(x => str(x, 40)).filter(Boolean).slice(0, 8)
    const img = b.imageUrl ? checkImageRef(null, b.imageUrl, b.imagePath) : null

    const ref = typeof b.id === 'string' && b.id ? db.collection('schedule').doc(b.id) : db.collection('schedule').doc()
    const old = await ref.get()
    if (old.exists && old.get('imagePath') && old.get('imagePath') !== (img?.imagePath ?? '')) await deleteImage(old.get('imagePath'))

    await ref.set({
      showName, dayOfWeek,
      // 24h "HH:MM" so it sorts correctly and the scheduler can read it.
      startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
      endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
      description: str(b.description, 600), hostNames, category: str(b.category, 30),
      imageUrl: img?.imageUrl ?? '', imagePath: img?.imagePath ?? '', showSlug: str(b.showSlug, 80),
      isActive: b.isActive !== false, updatedBy: t.uid,
    }, { merge: true })
    return { id: ref.id }
  })
}
