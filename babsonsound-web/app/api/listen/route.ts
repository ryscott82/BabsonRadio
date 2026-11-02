import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireUser, str } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { loadConfig } from '@/lib/server/autoschedule'
import { localDate } from '@/lib/server/tz'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { budgetState, loadUsageConfig, policyFor } from '@/lib/server/usage'
import { loadLimits } from '@/lib/server/listenLimits'
import { effectiveLimits, hourLabel, isQuiet } from '@/lib/listenLimits'
import { localParts } from '@/lib/autoschedule'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'

// Listening sessions. The apps ask here before playing and check in every minute while playing, so the station can
// keep within its monthly listener hours: one stream per account, no endless sessions, no idle streams, quiet hours,
// guest limits, and a daily cap only when the month is on track to run over.
//   POST { action: 'start' | 'beat' | 'stop', sessionId, device?, deviceId?, takeOver?, activeAgoSec? }
//   start while another device of the same account is playing -> { ok: false, reason: 'elsewhere', device } unless takeOver is true.
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

    const [cfg, uc, budget, np, access, s, limits] = await Promise.all([
      loadConfig(db), loadUsageConfig(db), budgetState(db, now), getNowPlaying(), accessOf(t), sref.get(), loadLimits(db),
    ])
    const live = !!(np.isShow || np.isLive)
    const guest = access.level === 'guest'
    const staff = access.level === 'director' || access.level === 'admin'
    // Students (and directors and admins) and guests have their own limits (Admin > Listening limits). The monthly-hours budget only
    // tightens them while it is switched on there.
    const aud = guest ? limits.guest : limits.student
    const bp = limits.budgetEnabled ? policyFor(budget) : null
    const policy = { ...effectiveLimits(aud, bp), liveOnly: !!bp?.liveOnly }
    const guestsOpen = !limits.budgetEnabled || budget.guestsOpen

    // One device at a time. Someone else's stream (a different device, playing within the last 90 s) stops a new start
    // unless the person chooses to switch; after a switch the old device is stopped at its next check-in.
    const deviceId = str(b.deviceId, 64), device = str(b.device, 12)
    const other = s.exists && s.get('sessionId') !== sessionId
    if (action === 'beat' && other) return deny('otherDevice', 'Now playing on another device.')
    if (action === 'start' && other && b.takeOver !== true) {
      const age = now - ((s.get('lastBeat') as Timestamp | undefined)?.toMillis() ?? 0)
      const sameDevice = !!deviceId && s.get('deviceId') === deviceId
      if (age < 90_000 && !sameDevice) {
        const where = s.get('device') === 'ios' ? 'the app on your phone or tablet' : 'a web browser'
        return { ...deny('elsewhere', `You are already listening on ${where}. Switch to this device?`), device: s.get('device') ?? '' }
      }
    }

    if (!live && !staff) {
      if (isQuiet(aud, localParts(now, cfg.timezone).minutes / 60)) return deny('quiet', `Quiet hours. The station is back at ${hourLabel(aud.quietEnd)}.`)
      if (policy.liveOnly) return deny('budget', 'The station is saving listening time this month. Live shows are still on.')
    }

    // Today's listening, by kind.
    const [y, m, d] = localDate(now, cfg.timezone)
    const dref = db.collection('listenDays').doc(`${t.uid}_${y}${m}${d}`)
    // Today's totals are only looked at by the daily limits below; when none of them applies, the read is skipped.
    const needDay = (!live && !staff && aud.dailyAutoMin > 0) || (guest && !live && !guestsOpen) || (!staff && !!policy.dailyCapMin && policy.dailyCapMin > 0)
    const day = needDay ? await dref.get() : null
    let autoMin = Number(day?.get('autoMin') ?? 0), liveMin = Number(day?.get('liveMin') ?? 0)

    if (action === 'beat') {
      const last = (s.get('lastBeat') as Timestamp | undefined)?.toMillis() ?? now
      const dt = Math.min(Math.max(0, now - last), 120_000) / 60_000
      if (dt > 0) {
        await dref.set({ uid: t.uid, [live ? 'liveMin' : 'autoMin']: FieldValue.increment(dt), at: Timestamp.fromMillis(now) }, { merge: true })
        if (live) liveMin += dt; else autoMin += dt
      }
      const started = (s.get('startedAt') as Timestamp).toMillis()
      if (policy.sessionMaxMin > 0 && now - started > policy.sessionMaxMin * 60_000) { await sref.delete(); return deny('session', `Stopped after ${Math.round(policy.sessionMaxMin / 60 * 10) / 10} hours. Tap play to keep listening.`) }
      const idleMs = Math.max(0, Number(b.activeAgoSec) || 0) * 1000
      if (idleMs > (policy.idleMin + 3) * 60_000) { await sref.delete(); return deny('idle', 'Stopped because no one seemed to be listening. Tap play to start again.') }
    }

    // Guests hear everything while the month is comfortably under the limit; otherwise live shows plus a few playlist minutes a day.
    if (!live && !staff && aud.dailyAutoMin > 0 && autoMin >= aud.dailyAutoMin) return deny('autoDaily', guest
      ? 'You have used today\'s playlist time. Live shows are still on. Add your school email for more.'
      : 'You have used today\'s playlist time. Live shows are still on. It resets at midnight.')
    if (guest && !live && !guestsOpen && autoMin >= uc.guestAutoMin) return deny('guestAuto', 'Listening is busy this month, so guests can hear live shows plus a few minutes of the playlist each day. Add your school email for the rest.')
    if (!staff && policy.dailyCapMin > 0 && autoMin + liveMin >= policy.dailyCapMin) return deny('daily', 'You have reached today\'s listening limit. It resets at midnight.')

    if (action === 'start') await sref.set({ sessionId, uid: t.uid, startedAt: Timestamp.fromMillis(now), lastBeat: Timestamp.fromMillis(now), device, deviceId })
    else await sref.update({ lastBeat: Timestamp.fromMillis(now) })
    return { ok: true, idleMin: policy.idleMin, sessionMaxMin: policy.sessionMaxMin, level: limits.budgetEnabled ? budget.level : 'normal' }
  })
}
