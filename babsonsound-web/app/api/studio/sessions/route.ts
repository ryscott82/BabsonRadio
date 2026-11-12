import { Timestamp } from 'firebase-admin/firestore'
import { STAFF_NAME } from '@/lib/roleLabel'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { attendanceId, isTrainerUid, namesFor, newSecret, publicSession, readSession, sessionsCol, studioActor } from '@/lib/server/studio'
import { isTrainerLevel, BADGES, type Badge } from '@/lib/studioRules'

export const runtime = 'nodejs'

// Studio training sessions. GET lists what is coming up (and the last week) with the caller's own RSVP / check-in state.
// Directors and admins also see which sessions they can run. POST creates one (Director or Admin trainer required).
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await studioActor(req)
    const { t, a } = actor
    const db = adminDb()
    const now = Date.now()
    const snap = await sessionsCol(db).where('endsAt', '>', Timestamp.fromMillis(now - 7 * 86_400_000)).orderBy('endsAt').limit(100).get()
    const sessions = snap.docs.map(readSession)
    const names = await namesFor(db, sessions.map(s => s.trainerUid))
    const mine = sessions.length ? await db.getAll(...sessions.map(s => db.collection('trainingAttendance').doc(attendanceId(s.id, t.uid)))) : []
    const byId = new Map(mine.map(d => [d.id, d]))
    return {
      sessions: sessions.map(s => {
        const row = byId.get(attendanceId(s.id, t.uid))
        return {
          ...publicSession(s, now, names.get(s.trainerUid)?.name ?? ''),
          canManage: a.level === 'admin' || (isTrainerLevel(a.level) && s.trainerUid === t.uid),
          me: {
            rsvp: row?.get('rsvpAt') != null && row?.get('removedAt') == null,
            checkedIn: row?.get('checkedInAt') != null,
            removed: row?.get('removedAt') != null,
            confirmed: row?.get('confirmedAt') != null,
          },
        }
      }),
      // Staff skip training; the app can hide the quiz for them.
      skipsTraining: isTrainerLevel(a.level),
    }
  })
}

// { title, covers: ['studio'|'radio'], startsAt, endsAt, location, capacity, trainerUid? } — trainerUid defaults to you; only an Admin can name someone else.
export async function POST(req: Request) {
  return handle(async () => {
    const { t, a } = await studioActor(req, 'staff')
    const b = await readJson(req)
    const db = adminDb()
    const title = str(b.title, 100), location = str(b.location, 150)
    const covers = (Array.isArray(b.covers) ? b.covers : []).filter((x): x is Badge => BADGES.includes(x as Badge))
    const startsAt = Number(b.startsAt), endsAt = Number(b.endsAt), capacity = Math.floor(Number(b.capacity))
    const trainerUid = str(b.trainerUid, 128) || t.uid
    if (!title) throw new HttpError(400, 'Give the session a title.')
    if (!covers.length) throw new HttpError(400, 'Pick what this session trains: Studio, Radio or both.')
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt || endsAt - startsAt > 8 * 3_600_000) throw new HttpError(400, 'Pick a start and an end time (up to 8 hours).')
    if (endsAt < Date.now()) throw new HttpError(400, 'That session is already over.')
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 500) throw new HttpError(400, 'Capacity must be between 1 and 500.')
    if (trainerUid !== t.uid && a.level !== 'admin') throw new HttpError(403, 'Only an admin can name another trainer.', 'BR-STU-003')
    if (!(await isTrainerUid(db, trainerUid))) throw new HttpError(400, `The trainer must be ${STAFF_NAME}.`, 'BR-STU-001')
    const ref = sessionsCol(db).doc()
    await ref.set({
      covers, title, location, capacity, trainerUid, status: 'scheduled', rsvpCount: 0,
      startsAt: Timestamp.fromMillis(startsAt), endsAt: Timestamp.fromMillis(endsAt),
      checkinSecret: newSecret(), createdBy: t.uid, createdAt: Timestamp.now(),
    })
    const d = await ref.get()
    return { session: publicSession(readSession(d), Date.now(), (await namesFor(db, [trainerUid])).get(trainerUid)?.name ?? '') }
  })
}

