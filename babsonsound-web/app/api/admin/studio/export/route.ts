import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, str } from '@/lib/server/http'
import { loadSession, ms, namesFor, studioActor } from '@/lib/server/studio'
import { buildRecruits, buildRoster, when } from '@/lib/server/studioAdmin'
import { toCsv } from '@/lib/studioRules'

export const runtime = 'nodejs'

// CSV downloads for directors and admins (send the Authorization header and save the response):
//   ?kind=roster                   everyone with a badge, newest first (add q, badge, status, trainer to filter like the roster page)
//   ?kind=session&sessionId=<id>   who saved a spot, checked in, was removed and was confirmed
//   ?kind=person&uid=<uid>         one person's grants
//   ?kind=recruits                 the club recruiting list
export async function GET(req: Request) {
  let csv = '', name = 'studio.csv'
  const res = await handle(async () => {
    await studioActor(req, 'staff')
    const p = new URL(req.url).searchParams
    const kind = p.get('kind') ?? 'roster'
    const db = adminDb()
    const day = new Date().toISOString().slice(0, 10)
    const grantHeader = ['name', 'email', 'badge', 'status', 'granted', 'expires', 'trainer', 'session', 'quiz score', 'granted by', 'reason', 'revoked', 'revoked by', 'revoke reason']
    const grantRow = (r: Awaited<ReturnType<typeof buildRoster>>[number]) =>
      [r.name, r.email, r.badge, r.legacy ? `${r.status} (old flow)` : r.status, when(r.grantedAt), when(r.expiresAt), r.trainerName, r.sessionId, r.quizScore, r.grantedBy, r.reason, when(r.revokedAt), r.revokedBy, r.revokeReason]
    if (kind === 'roster') {
      const rows = await buildRoster(db, { q: p.get('q') ?? '', badge: p.get('badge') ?? '', status: p.get('status') ?? '', trainer: p.get('trainer') ?? '', sessionId: p.get('sessionId') ?? '' })
      csv = toCsv(grantHeader, rows.map(grantRow)); name = `studio-roster-${day}.csv`
    } else if (kind === 'person') {
      const uid = str(p.get('uid'), 128)
      if (!uid) throw new HttpError(400, 'Pick a person.')
      csv = toCsv(grantHeader, (await buildRoster(db, { uid })).map(grantRow)); name = `studio-person-${day}.csv`
    } else if (kind === 'session') {
      const s = await loadSession(db, str(p.get('sessionId'), 128))
      const snap = await db.collection('trainingAttendance').where('sessionId', '==', s.id).get()
      const names = await namesFor(db, snap.docs.flatMap(d => [String(d.get('uid')), String(d.get('confirmedBy') ?? ''), String(d.get('removedBy') ?? '')]))
      const rows = snap.docs.map(d => {
        const uid = String(d.get('uid'))
        return [names.get(uid)?.name ?? '', names.get(uid)?.email ?? '', when(ms(d.get('rsvpAt'))), when(ms(d.get('checkedInAt'))), when(ms(d.get('removedAt'))), names.get(String(d.get('removedBy') ?? ''))?.name ?? '',
          when(ms(d.get('confirmedAt'))), names.get(String(d.get('confirmedBy') ?? ''))?.name ?? '', d.get('lastScore') ?? '', when(ms(d.get('grantedAt')))]
      }).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      csv = toCsv(['name', 'email', 'saved a spot', 'checked in', 'removed', 'removed by', 'confirmed', 'confirmed by', 'quiz score', 'badge granted'], rows); name = `studio-session-${s.id}.csv`
    } else if (kind === 'recruits') {
      csv = toCsv(['name', 'email', 'note', 'updated'], (await buildRecruits(db)).map(r => [r.name, r.email, r.note, when(r.updatedAt)])); name = `club-recruits-${day}.csv`
    } else throw new HttpError(400, 'Unknown export.')
    return { ok: true }
  })
  if (res.status !== 200) return res
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } })
}
