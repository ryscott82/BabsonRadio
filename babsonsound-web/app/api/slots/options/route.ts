import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { readiness } from '@/lib/server/conduct'
import { accessOf } from '@/lib/server/access'
import { SLOT_RULES } from '@/lib/slots'
import { LIVE_MAX_MINUTES, POLICY_VERSION, QUIET_WARNING } from '@/lib/studioBookCore'
import { loadStudioRules } from '@/lib/server/studioRules'
import { maybeRebuildPopular } from '@/lib/server/popularTimes'
import { after } from 'next/server'
import { AUTO, nyWeekKey, weekKeysFrom } from '@/lib/slotAuto'
import { loadSlotRules } from '@/lib/server/slotRules'

export const runtime = 'nodejs'

// Everything the request screen needs in one call (replaces /api/me and /api/host/readiness reads there). Not polled; private, never cached.
//   { canLive, trainedReason: null | 'training' | 'expired', agreementSigned, lastShow, rules, weekHasShow: { 'YYYY-MM-DD' (the Monday): true } }
// weekHasShow lists the next 4 Monday-to-Sunday weeks (New York, this week first) in which this person already has a pending or approved show.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const db = adminDb()
    const now = Date.now()
    const sr = await loadSlotRules(db)
    const studio = await loadStudioRules(db)
    // Popular times are rebuilt at most once a week, here, after the reply is sent (no cron).
    after(() => maybeRebuildPopular(db).catch(e => console.error('[popular times]', e)))
    const [ready, a, mine] = await Promise.all([
      readiness(db, t), accessOf(t),
      db.collection('slotRequests').where('requesterUid', '==', t.uid).get(),
    ])
    const rows = mine.docs.map(d => ({ d, created: (d.get('createdAt')?.toMillis?.() as number | undefined) ?? 0 })).sort((x, y) => y.created - x.created)
    const last = rows[0]?.d
    const weeks = new Set(weekKeysFrom(now, AUTO.optionsWeeks))
    const weekHasShow: Record<string, true> = {}
    for (const d of mine.docs) {
      if (d.get('status') !== 'pending' && d.get('status') !== 'approved') continue
      const k = nyWeekKey(d.get('startAt').toMillis())
      if (weeks.has(k)) weekHasShow[k] = true
    }
    return {
      canLive: ready.trained,
      trainedReason: ready.trained ? null : a.radioExpired ? 'expired' : 'training',
      agreementSigned: ready.conductSigned,
      lastShow: last ? {
        title: String(last.get('title') ?? ''), description: String(last.get('description') ?? ''), location: String(last.get('location') ?? ''),
        type: String(last.get('type') ?? ''), category: String(last.get('category') ?? ''), durationMin: Number(last.get('durationMin') ?? 0),
        audioURL: String(last.get('audioURL') ?? ''), imageUrl: String(last.get('imageUrl') ?? ''), receiveRatings: last.get('receiveRatings') !== false,
        startAt: last.get('startAt').toMillis() as number, status: String(last.get('status') ?? ''),
      } : null,
      rules: { ...SLOT_RULES, minLeadHours: sr.minLeadHours, autoApproveHours: sr.afterHours, autoApproveBeforeStartHours: sr.beforeStartHours, weekLimit: sr.weekLimit, maxRepeatWeeks: sr.maxRepeatWeeks,
        // Live shows are capped at 90 minutes; maxMinutes above stays the cap for pre-recorded shows.
        liveMaxMinutes: LIVE_MAX_MINUTES, capacity: studio.capacity, policyVersion: POLICY_VERSION, quietWarning: QUIET_WARNING },
      weekHasShow,
    }
  }, { 'Cache-Control': 'private, no-store' })
}
