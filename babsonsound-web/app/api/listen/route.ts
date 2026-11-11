import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireUser, str } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { loadConfig } from '@/lib/server/autoschedule'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { budgetState, policyFor } from '@/lib/server/usage'
import { loadLimits } from '@/lib/server/listenLimits'
import { effectiveLimits, hourLabel, isQuiet } from '@/lib/listenLimits'
import { localParts } from '@/lib/autoschedule'
import { recordPresence } from '@/lib/server/liveData'
import { buildMe } from '@/lib/server/liveBundle'
import { throttled } from '@/lib/server/tierGate'
import { createLastKnown } from '@/lib/lastKnown'
import { DEFAULT_REFRESH_SEC, PRESENCE_TTL_MS, cleanOcc, sectionsOf, type MeBundle } from '@/lib/liveBundle'

export const runtime = 'nodejs'

// The listening check-in. ONE call when playing starts, then one about every 12 minutes while it plays, and one best-effort call when it stops.
//   POST { action: 'start' | 'refresh' | 'stop', sessionId, device?, deviceId?, takeOver?, sections?, occId? }
//     sections / occId   which of the person's own data to send back (same names as /api/live/bundle?part=me&sections=…). Leave them out for none.
//   -> { ok: true, refreshSec, idleMin, sessionMaxMin, level, access: { level }, me?: MeBundle }
//   -> { ok: false, reason, message }   reason: 'elsewhere' (start while another device plays: send takeOver: true to switch),
//                                                'otherDevice' (refresh from a device that was switched away from), 'quiet', 'budget'
// What one check-in does: the one-device rule, presence (the "tuned in" list and the listening log), and the personal data. Nothing else.
//   - Idle ("still listening?") and the longest session are the page's / app's own timers (idleMin and sessionMaxMin tell them the numbers).
//     The server no longer checks idle time, session length or daily minutes, and keeps no per-day counters.
//   - refreshSec is how long to wait before the next check-in (default 12 minutes). Admin > Listening limits sets it (usage/limits.refreshSec), so
//     it changes without an app update.
//   - Someone stays on the "tuned in" list for 18 minutes after their last check-in (PRESENCE_TTL_MS).
//   - Quiet hours and the budget's live-only rule are decided at the start call (they cost no extra reads).
//   - 'beat' is what older apps send every minute: it still works, but a beat from a session this server already looked at in the last 5
//     minutes is answered from memory with no Firestore work. Their idle / session limits stop being enforced by the server.

type Deny = { ok: false; reason: string; message: string; device?: string }
const deny = (reason: string, message: string): Deny => ({ ok: false, reason, message })

interface Reply { ok: true; refreshSec: number; idleMin: number; sessionMaxMin: number; level: string; access: { level: string }; me?: MeBundle }

/** What a throttled-off check-in answers: the person can listen, nothing is recorded. */
const EMPTY: Reply = { ok: true, refreshSec: DEFAULT_REFRESH_SEC, idleMin: 60, sessionMaxMin: 360, level: 'normal', access: { level: 'student' } }

const known = createLastKnown<{ sessionId: string; reply: Reply }>(4000)
const OLD_BEAT_GAP_MS = 5 * 60_000 // an older app's per-minute beat reaches Firestore at most this often
const REFRESH_GAP_MS = 60_000 // a refresh right after another one (several tabs, a page coming back) gets the last answer

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    const action = str(b.action, 8), sessionId = str(b.sessionId, 64)
    if (!sessionId || !['start', 'refresh', 'beat', 'stop'].includes(action)) return { ok: true }
    const db = adminDb()
    const now = Date.now()
    const sref = db.collection('listenGuard').doc(t.uid)

    if (action === 'stop') {
      known.forget(t.uid)
      const s = await sref.get()
      if (s.get('sessionId') === sessionId) {
        await sref.delete()
        await recordPresence(db, t.uid, false, s.get('device') === 'ios' ? 'ios' : 'web', now).catch(() => {}) // "no longer tuned in" at once, when the stop arrives
      }
      return { ok: true }
    }

    // A check-in from a session we already looked at a moment ago: same answer, no work.
    const mem = known.peek(t.uid)
    if (mem && mem.value.sessionId === sessionId && action !== 'start') {
      const age = now - mem.at
      if (action === 'beat' && age < OLD_BEAT_GAP_MS) return mem.value.reply
      if (action === 'refresh' && age < REFRESH_GAP_MS) return mem.value.reply
    }

    const checkIn = async (): Promise<Reply | Deny> => {
      const [cfg, limits, np, access, s] = await Promise.all([loadConfig(db), loadLimits(db), getNowPlaying(), accessOf(t), sref.get()])
      const live = !!(np.isShow || np.isLive)
      const guest = access.level === 'guest'
      const staff = access.level === 'director' || access.level === 'admin'
      // Students (and directors and admins) and guests have their own numbers (Admin > Listening limits). The monthly-hours budget only
      // tightens them while it is switched on there, and costs a read only then.
      const aud = guest ? limits.guest : limits.student
      const budget = limits.budgetEnabled ? await budgetState(db, now) : null
      const bp = budget ? policyFor(budget) : null
      const policy = { ...effectiveLimits(aud, bp), liveOnly: !!bp?.liveOnly }

      // One device at a time. Someone else's stream (a different device that checked in within the last 18 minutes) stops a new start unless the
      // person chooses to switch; after a switch the old device finds out at its next check-in (within 12 minutes).
      const deviceId = str(b.deviceId, 64), device = str(b.device, 12)
      const other = s.exists && s.get('sessionId') !== sessionId
      if (action !== 'start' && other) return deny('otherDevice', 'Now playing on another device.')
      if (action === 'start' && other && b.takeOver !== true) {
        const age = now - ((s.get('lastBeat') as Timestamp | undefined)?.toMillis() ?? 0)
        const sameDevice = !!deviceId && s.get('deviceId') === deviceId
        if (age < PRESENCE_TTL_MS && !sameDevice) {
          const where = s.get('device') === 'ios' ? 'the app on your phone or tablet' : 'a web browser'
          return { ...deny('elsewhere', `You are already listening on ${where}. Switch to this device?`), device: s.get('device') ?? '' }
        }
      }

      if (action === 'start' && !live && !staff) {
        if (isQuiet(aud, localParts(now, cfg.timezone).minutes / 60)) return deny('quiet', `Quiet hours. The station is back at ${hourLabel(aud.quietEnd)}.`)
        if (policy.liveOnly) return deny('budget', 'The station is saving listening time this month. Live shows are still on.')
      }

      const platform = (action === 'start' ? device : String(s.get('device') ?? '')) === 'ios' ? 'ios' : 'web'
      if (action === 'start' || !s.exists) {
        await sref.set({ sessionId, uid: t.uid, startedAt: Timestamp.fromMillis(now), lastBeat: Timestamp.fromMillis(now), device, deviceId, presenceAt: Timestamp.fromMillis(now) })
      } else {
        await sref.update({ lastBeat: Timestamp.fromMillis(now), presenceAt: Timestamp.fromMillis(now) })
      }
      await recordPresence(db, t.uid, true, platform, now).catch(() => {}) // the tuned-in list and the listening log

      const reply: Reply = {
        ok: true, refreshSec: limits.refreshSec,
        idleMin: policy.idleMin, sessionMaxMin: policy.sessionMaxMin, level: budget ? budget.level : 'normal', access: { level: access.level },
      }
      // The person's own data comes back in the same call (nothing else is asked while playing). Only for the new actions: an older app's beat has no use for it.
      if (action !== 'beat' && typeof b.sections === 'string') {
        reply.me = await buildMe(db, t, sectionsOf(str(b.sections, 120)), cleanOcc(b.occId), now)
      }
      known.remember(t.uid, { sessionId, reply }, now)
      return reply
    }

    // Switching devices must always reach the check (a remembered "elsewhere" answer would trap the person), so it skips the throttle.
    if (action === 'start' && b.takeOver === true) return checkIn()
    return throttled<Reply | Deny>('listen', t.uid, EMPTY, checkIn, '')
  })
}
