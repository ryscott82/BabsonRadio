import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { cleanRepeat, parseClock } from '@/lib/autoschedule'
import { checkImageRef, deleteImage } from '@/lib/server/images'
import { cleanColor } from '@/lib/server/color'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'

export const runtime = 'nodejs'


// Weekly recurring shows (the `schedule` collection). Staff only.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const snap = await adminDb().collection('schedule').get()
    const db = adminDb()
    const uidSet = [...new Set(snap.docs.flatMap(d => (d.get('hostUids') as string[] | undefined) ?? []))]
    const names = new Map<string, string>()
    if (uidSet.length) for (const u of await db.getAll(...uidSet.map(id => db.collection('users').doc(id)))) names.set(u.id, u.get('username') ?? '')
    const shows = snap.docs.map(d => ({
      id: d.id, showName: d.get('showName') ?? '', dayOfWeek: d.get('dayOfWeek') ?? 0,
      startTime: d.get('startTime') ?? '', endTime: d.get('endTime') ?? '',
      description: d.get('description') ?? '', hostNames: d.get('hostNames') ?? [], category: d.get('category') ?? '',
      color: d.get('color') ?? '', imageUrl: d.get('imageUrl') ?? '', imagePath: d.get('imagePath') ?? '', showSlug: d.get('showSlug') ?? '',
      isActive: d.get('isActive') !== false,
      repeat: d.get('repeat') ?? 'weekly', anchor: d.get('anchor') ?? '', weeks: d.get('weeks') ?? [], dates: d.get('dates') ?? [],
      hostUsernames: ((d.get('hostUids') as string[] | undefined) ?? []).map(u => names.get(u) ?? '').filter(Boolean),
    })).sort((a, b) => a.dayOfWeek - b.dayOfWeek || String(a.startTime).localeCompare(String(b.startTime)))
    return { shows }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const db = adminDb()

    if (b.action === 'delete') {
      const ref = db.collection('schedule').doc(str(b.id, 100))
      const old = await ref.get()
      if (old.exists) { await deleteImage(old.get('imagePath')); await ref.delete() }
      await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e))
      return { ok: true }
    }

    const showName = str(b.showName, 80)
    const dayOfWeek = Number(b.dayOfWeek)
    const start = parseClock(str(b.startTime, 10)), end = parseClock(str(b.endTime, 10))
    if (!showName) throw new HttpError(400, 'Give the show a name.')
    const rep = cleanRepeat(b)
    if (rep.repeat !== 'dates' && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) throw new HttpError(400, 'Pick a day.')
    if (rep.repeat === 'dates' && !rep.dates?.length) throw new HttpError(400, 'Add at least one date.')
    if (rep.repeat === 'monthly' && !rep.weeks?.length) throw new HttpError(400, 'Pick which weeks of the month.')
    if (rep.repeat === 'biweekly' && !rep.anchor) throw new HttpError(400, 'Pick a date this show airs, so we know which weeks.')
    if (start === null || end === null || end === start) throw new HttpError(400, 'Pick a start time and an end time. An end before the start means the show runs past midnight.')
    const hostNames = (Array.isArray(b.hostNames) ? b.hostNames : []).map(x => str(x, 40)).filter(Boolean).slice(0, 8)
    const img = b.imageUrl ? checkImageRef(null, b.imageUrl, b.imagePath) : null
    // Host accounts (usernames): these people get the host panel during this show's window.
    const hostUsernames = (Array.isArray(b.hostUsernames) ? b.hostUsernames : []).map(x => str(x, 60).toLowerCase().replace(/^@/, '')).filter(Boolean).slice(0, 8)
    const hostUids: string[] = []
    for (const un of hostUsernames) {
      const q = await db.collection('users').where('username', '==', un).limit(1).get()
      if (q.empty) throw new HttpError(400, `No account has the username "${un}". They need to sign up first.`)
      hostUids.push(q.docs[0].id)
    }

    const ref = typeof b.id === 'string' && b.id ? db.collection('schedule').doc(b.id) : db.collection('schedule').doc()
    const old = await ref.get()
    if (old.exists && old.get('imagePath') && old.get('imagePath') !== (img?.imagePath ?? '')) await deleteImage(old.get('imagePath'))

    await ref.set({
      showName, dayOfWeek: Number.isInteger(dayOfWeek) ? dayOfWeek : 0, ...rep,
      // 24h "HH:MM" so it sorts correctly and the scheduler can read it.
      startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
      endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
      description: str(b.description, 600), hostNames, hostUids, category: str(b.category, 30), color: cleanColor(b.color),
      imageUrl: img?.imageUrl ?? '', imagePath: img?.imagePath ?? '', showSlug: str(b.showSlug, 80),
      isActive: b.isActive !== false, updatedBy: t.uid,
    }, { merge: true })
    await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e)) // auto blocks make room
    return { id: ref.id }
  })
}
