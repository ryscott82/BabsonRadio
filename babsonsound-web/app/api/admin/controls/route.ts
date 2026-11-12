import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { controlAccess } from '@/lib/stationControls'
import { loadConfig, setColorMode } from '@/lib/server/autoschedule'
import { logSettingChanges } from '@/lib/server/adminSettings'
import { azControl, azSkipVerified, azuraConfigured, azNowPlaying } from '@/lib/server/azuracast'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'
import { getNote, occIdOf } from '@/lib/server/live'
import { getAnnouncement, setAnnouncement } from '@/lib/server/announcement'
import { getAudioFx, setAudioFx } from '@/lib/server/audioFx'
import { getOnAirSign, setOnAirSign } from '@/lib/server/onAirSign'
import { getMaintenance, setMaintenance } from '@/lib/server/maintenance'
import { notifyAdmins } from '@/lib/server/push'
import { after } from 'next/server'

export const runtime = 'nodejs'

let answer: { at: number; v: unknown } | null = null // shared for a few seconds; cleared by any button below

// E-board does not get the Admin-only states (audio processing, maintenance mode).
const pick = (v: Record<string, unknown>, admin: boolean) => { if (admin) return v; const { audioFx, maintenance, ...rest } = v; void audioFx; void maintenance; return rest }

// Station controls for E-board and Admins: what is on, the shows we can pin a message to, and the big buttons.
// E-board: skip, emergency-stop, resume, on-air-sign, announce, clear-announcement, color-mode. Admins only: audio-fx and maintenance (lib/stationControls.ts).
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const admin = (await accessOf(t)).level === 'admin'
    if (answer && Date.now() - answer.at < 8_000) return pick(answer.v as Record<string, unknown>, admin)
    const db = adminDb()
    const now = Date.now()
    const items = (await buildScheduleFeed(db, { days: 2, showStudentHosts: false, now })).filter(i => i.source !== 'auto')
    const shows = await Promise.all(items.slice(0, 20).map(async i => ({
      occId: occIdOf(i), title: i.title, startAt: i.startAt, endAt: i.endAt, onAir: i.startAt <= now && i.endAt > now,
      note: await getNote(db, occIdOf(i), now),
    })))
    const out = { configured: azuraConfigured(), nowPlaying: await azNowPlaying().catch(() => null), shows, announcement: await getAnnouncement(db, now), audioFx: await getAudioFx(db, now), onAirSign: await getOnAirSign(db, now), maintenance: await getMaintenance(db, now), colorMode: (await loadConfig(db)).colorChanging }
    answer = { at: Date.now(), v: out }
    return pick(out, admin)
  })
}

// { action: 'skip' | 'emergency-stop' | 'resume' | 'maintenance' (with on) | ... }. Every use is logged.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const body = await readJson(req)
    const action = body.action
    const level = (await accessOf(t)).level
    const allowed = controlAccess(level, action)
    if (allowed === 'forbidden') throw new HttpError(403, 'Admins only.', 'BR-PERM-002')
    if (allowed === 'unknown') throw new HttpError(400, 'Unknown action.')
    answer = null
    if (action === 'color-mode') {
      // Album-art colours: flips this one Auto DJ value and nothing else. Logged in Settings history and in the station log.
      const on = body.on === true
      const r = await setColorMode(adminDb(), on, t.uid)
      await logSettingChanges(adminDb(), r.before === r.after ? [] : [{ key: 'auto.colorChanging', old: r.before, new: r.after }], t.email ?? t.uid).catch(e => console.error('[settingsLog]', e))
      await adminDb().collection('hostActions').add({ uid: t.uid, action: on ? 'color-mode-on' : 'color-mode-off', show: '(station)', at: Timestamp.now() })
      return { ok: true, colorMode: on }
    }
    if (action === 'maintenance') {
      await setMaintenance(adminDb(), body.on === true, t.uid)
      await adminDb().collection('hostActions').add({ uid: t.uid, action: body.on === true ? 'maintenance-on' : 'maintenance-off', show: '(admin)', at: Timestamp.now() })
      return { ok: true }
    }
    if (action === 'on-air-sign') {
      await setOnAirSign(adminDb(), body.on === true, t.uid)
      await adminDb().collection('hostActions').add({ uid: t.uid, action: body.on === true ? 'on-air-sign-on' : 'on-air-sign-off', show: '(admin)', at: Timestamp.now() })
      return { ok: true }
    }
    if (action === 'audio-fx') {
      await setAudioFx(adminDb(), body.on === true, t.uid)
      await adminDb().collection('hostActions').add({ uid: t.uid, action: body.on === true ? 'audio-fx-on' : 'audio-fx-off', show: '(admin)', at: Timestamp.now() })
      return { ok: true }
    }
    // Audience message: works even if the radio itself is not connected.
    if (action === 'announce' || action === 'clear-announcement') {
      await setAnnouncement(adminDb(), action === 'announce' ? String(body.text ?? '') : '', Number(body.minutes) || 60, t.uid)
      await adminDb().collection('hostActions').add({ uid: t.uid, action: String(action), show: '(admin)', at: Timestamp.now() })
      return { ok: true }
    }
    if (!azuraConfigured()) throw new HttpError(503, 'The radio controls are not connected yet.', 'BR-HST-003')
    let note = ''
    try {
      if (action === 'skip') { if (!(await azSkipVerified())) note = 'AzuraCast skipped the song, but the now-playing info has not changed yet. The stream runs behind, so it can take a few seconds to hear.' }
      else if (action === 'emergency-stop') { await azControl('backend', 'stop'); await azControl('frontend', 'stop') }
      else if (action === 'resume') { await azControl('frontend', 'start'); await azControl('backend', 'start') }
      else throw new HttpError(400, 'Unknown action.')
    } catch (e) {
      if (e instanceof HttpError) throw e
      console.error('[admin controls]', e)
      // Say what AzuraCast actually answered (without any key), so a skip that does nothing can be diagnosed.
      const why = e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 160) : ''
      throw new HttpError(502, `The radio did not accept that${why ? ` (${why})` : ''}. Check the AzuraCast key has broadcasting permission.`, 'BR-HST-003')
    }
    await adminDb().collection('hostActions').add({ uid: t.uid, action: String(action), show: '(admin)', at: Timestamp.now() })
    if (action === 'emergency-stop' || action === 'resume') after(() => notifyAdmins('ops', { title: action === 'resume' ? 'Station back on air' : 'Station stopped', body: 'Another admin used the station controls.' }, t.uid))
    return { ok: true, ...(note ? { note } : {}) }
  })
}
