import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { parseClock } from '@/lib/autoschedule'
import { loadConfig, rebuildAutoSchedule } from '@/lib/server/autoschedule'
import { localToUtc, localDate } from '@/lib/server/tz'
import { checkImageRef, deleteImage } from '@/lib/server/images'
import { cleanColor } from '@/lib/server/color'

export const runtime = 'nodejs'

// One-time events on the schedule (the `events` collection). Staff only. Times are station time.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const db = adminDb()
    const tz = (await loadConfig(db)).timezone
    const since = Timestamp.fromMillis(Date.now() - 86_400_000)
    const snap = await db.collection('events').where('endAt', '>', since).get()
    const fmt = (ms: number) =>
      new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
    const events = snap.docs.map(d => {
      const s = d.get('startAt').toMillis() as number, e = d.get('endAt').toMillis() as number
      const [y, m, dd] = localDate(s, tz)
      return {
        id: d.id, title: d.get('title') ?? '', description: d.get('description') ?? '', hostNames: d.get('hostNames') ?? [],
        category: d.get('category') ?? '', color: d.get('color') ?? '',
        useAutoMeta: d.get('useAutoMeta') === true, imageUrl: d.get('imageUrl') ?? '', imagePath: d.get('imagePath') ?? '',
        isActive: d.get('isActive') !== false, startAt: s,
        date: `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
        startTime: fmt(s), endTime: fmt(e),
      }
    }).sort((a, b) => a.startAt - b.startAt)
    return { events, timezone: tz }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const db = adminDb()

    if (b.action === 'delete') {
      const ref = db.collection('events').doc(str(b.id, 100))
      const old = await ref.get()
      if (old.exists) { await deleteImage(old.get('imagePath')); await ref.delete() }
      await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e))
      return { ok: true }
    }

    const title = str(b.title, 80)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(b.date, 10))
    const start = parseClock(str(b.startTime, 10)), end = parseClock(str(b.endTime, 10))
    if (!title) throw new HttpError(400, 'Give the event a name.')
    if (!m) throw new HttpError(400, 'Pick a date.')
    if (start === null || end === null || end === start) throw new HttpError(400, 'Pick a start time and an end time. An end before the start means the event runs past midnight.')
    const tz = (await loadConfig(db)).timezone
    const startAt = localToUtc(Number(m[1]), Number(m[2]), Number(m[3]), start, tz)
    const endAt = localToUtc(Number(m[1]), Number(m[2]), Number(m[3]), end > start ? end : end + 1440, tz)
    if (endAt <= Date.now()) throw new HttpError(400, 'That time has already passed.')

    const img = b.imageUrl ? checkImageRef(null, b.imageUrl, b.imagePath) : null
    const hostNames = (Array.isArray(b.hostNames) ? b.hostNames : []).map(x => str(x, 40)).filter(Boolean).slice(0, 8)
    const ref = typeof b.id === 'string' && b.id ? db.collection('events').doc(b.id) : db.collection('events').doc()
    const old = await ref.get()
    if (old.exists && old.get('imagePath') && old.get('imagePath') !== (img?.imagePath ?? '')) await deleteImage(old.get('imagePath'))
    await ref.set({
      title, description: str(b.description, 600), hostNames, category: str(b.category, 30), color: cleanColor(b.color),
      useAutoMeta: b.useAutoMeta === true,
      imageUrl: img?.imageUrl ?? '', imagePath: img?.imagePath ?? '', isActive: b.isActive !== false,
      startAt: Timestamp.fromMillis(startAt), endAt: Timestamp.fromMillis(endAt), updatedBy: t.uid,
    })
    await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e)) // auto blocks make room
    return { id: ref.id }
  })
}
