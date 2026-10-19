import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireUser, str } from '@/lib/server/http'
import { loadConfig } from '@/lib/server/autoschedule'
import { localDate } from '@/lib/server/tz'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { budgetState, inQuietHours, loadUsageConfig, policyFor } from '@/lib/server/usage'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'

// Listening sessions. The apps ask here before playing and check in every minute while playing, so the station can
// keep within its monthly listener hours: one stream per account, no endless sessions, no idle streams, quiet hours,
// guest limits, and a daily cap only when the month is on track to run over.
//   POST { action: 'start' | 'beat' | 'stop', sessionId, device?, activeAgoSec? }
//   -> { ok: true, idleMin, sessionMaxMin, level } or { ok: false, reason, message }

type Deny = { ok: false; reason: string; message: string }
const deny = (reason: string, message: string): Deny => ({ ok: false, reason, message })

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    const action = str(b.action, 8), sessionId = str(b.sessionId, 64)
    if (!sessionId || !['start', 'beat', 'stop'].includes(action)) return { ok: true }
    const db = adminDb()
    const now = Date.now()
    const sref = db.collection('listenGuard').doc(t.uid)

    if (action === 'stop') {
      const s = await sref.get()
      if (s.get('sessionId') === sessionId) await sref.delete()
      return { ok: true }
    }

    const [cfg, uc, budget, np, u, s] = await Promise.all([
      loadConfig(db), loadUsageConfig(db), budgetState(db, now), getNowPlaying(), db.collection('users').doc(t.uid).get(), sref.get(),
    ])
    const policy = policyFor(budget)
    const live = !!(np.isShow || np.isLive)
    const guest = u.get('role') === 'guest'
    const staff = ['superAdmin', 'director'].includes(String(u.get('role'))) || t.developer === true

    // The same person on another device? The newest start wins.
    if (action === 'beat' && s.get('sessionId') !== sessionId) return deny('otherDevice', 'Now playing on another device.')

    if (!live && !staff) {
      if (inQuietHours(uc, cfg.timezone, now)) return deny('quiet', `Quiet hours. The station is back at ${uc.quietEnd > 12 ? uc.quietEnd - 12 : uc.quietEnd}${uc.quietEnd >= 12 ? 'pm' : 'am'}.`)
      if (policy.liveOnly) return deny('budget', 'The station is saving listening time this month. Live shows are still on.')
    }

    // Today's listening, by kind.
    const [y, m, d] = localDate(now, cfg.timezone)
    const dref = db.collection('listenDays').doc(`${t.uid}_${y}${m}${d}`)
    const day = await dref.get()
    let autoMin = Number(day.get('autoMin') ?? 0), liveMin = Number(day.get('liveMin') ?? 0)

    if (action === 'beat') {
      const last = (s.get('lastBeat') as Timestamp | undefined)?.toMillis() ?? now
      const dt = Math.min(Math.max(0, now - last), 120_000) / 60_000
      if (dt > 0) {
        await dref.set({ uid: t.uid, [live ? 'liveMin' : 'autoMin']: FieldValue.increment(dt), at: Timestamp.fromMillis(now) }, { merge: true })
        if (live) liveMin += dt; else autoMin += dt
      }
      const started = (s.get('startedAt') as Timestamp).toMillis()
      if (now - started > policy.sessionMaxMin * 60_000) { await sref.delete(); return deny('session', `Stopped after ${Math.round(policy.sessionMaxMin / 60 * 10) / 10} hours. Tap play to keep listening.`) }
      const idleMs = Math.max(0, Number(b.activeAgoSec) || 0) * 1000
      if (idleMs > (policy.idleMin + 3) * 60_000) { await sref.delete(); return deny('idle', 'Stopped because no one seemed to be listening. Tap play to start again.') }
    }

    // Guests hear everything while the month is comfortably under the limit; otherwise live shows plus a few playlist minutes a day.
    if (guest && !live && !budget.guestsOpen && autoMin >= uc.guestAutoMin) return deny('guestAuto', 'Listening is busy this month, so guests can hear live shows plus a few minutes of the playlist each day. Add your school email for the rest.')
    if (!guest && !staff && policy.dailyCapMin != null && autoMin + liveMin >= policy.dailyCapMin) return deny('daily', 'You have reached today\'s listening limit, which the station sets when listening runs high. It resets at midnight.')

    if (action === 'start') await sref.set({ sessionId, uid: t.uid, startedAt: Timestamp.fromMillis(now), lastBeat: Timestamp.fromMillis(now), device: str(b.device, 12) })
    else await sref.update({ lastBeat: Timestamp.fromMillis(now) })
    return { ok: true, idleMin: policy.idleMin, sessionMaxMin: policy.sessionMaxMin, level: budget.level }
  })
}
