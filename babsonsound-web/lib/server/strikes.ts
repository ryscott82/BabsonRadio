import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { HttpError } from './http'
import { loadStudioRules } from './studioRules'
import { azHistory, azuraConfigured } from './azuracast'
import { sendMail, strikeMail } from './mailer'
import { STRIKE_KINDS, KIND_TEXT, bannedUntilOf, emailKindFor, levelOf, liveNoShow, prerecordedNoAudio, semesterEndMs, standingOf, strikeId, counts, type StrikeKind, type StrikeLike } from '../strikesCore'

// Strikes (collection `strikes`, admin SDK only). Detection only FLAGS (status 'pending'). A person on the E-board confirms or excuses each one.
// A confirmed strike carries `expiresAt` (the end of the semester date in Settings when it was confirmed) and counts until then.
// users/{uid} keeps strikeLevel, strikeUntil and bannedUntil so show requests and studio bookings check a ban with no extra read.

export interface StrikeDoc extends StrikeLike { id: string; uid: string; refId: string; note: string; title: string; decidedBy: string; decidedAt: number | null }
const docOf = (d: FirebaseFirestore.DocumentSnapshot): StrikeDoc => ({
  id: d.id, uid: String(d.get('uid') ?? ''), kind: String(d.get('kind') ?? 'manual'), refId: String(d.get('refId') ?? ''), status: String(d.get('status') ?? 'pending'),
  note: String(d.get('note') ?? ''), title: String(d.get('title') ?? ''), at: (d.get('at') as Timestamp | undefined)?.toMillis() ?? 0,
  expiresAt: (d.get('expiresAt') as Timestamp | undefined)?.toMillis() ?? null, decidedBy: String(d.get('decidedBy') ?? ''), decidedAt: (d.get('decidedAt') as Timestamp | undefined)?.toMillis() ?? null,
})

/** Flags one strike for review. The id is made from the kind and what it is about, so flagging the same thing twice does nothing. Returns true when new. */
export async function flagStrike(db: Firestore, o: { uid: string; kind: StrikeKind; refId: string; note?: string; title?: string; at?: number; status?: 'pending' | 'confirmed'; by?: string; expiresAt?: number }): Promise<boolean> {
  if (!STRIKE_KINDS.includes(o.kind)) throw new HttpError(400, 'Unknown strike kind.')
  const ref = db.collection('strikes').doc(strikeId(o.kind, o.refId))
  try {
    await ref.create({
      uid: o.uid, kind: o.kind, refId: o.refId, status: o.status ?? 'pending', note: (o.note ?? '').slice(0, 300), title: (o.title ?? '').slice(0, 120),
      at: Timestamp.fromMillis(o.at ?? Date.now()), decidedBy: o.by ?? '',
      ...(o.status === 'confirmed' ? { decidedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(o.expiresAt ?? 0) } : {}),
    })
    return true
  } catch (e) {
    if ((e as { code?: number }).code === 6) return false // already flagged
    throw e
  }
}

/** Recomputes a person's standing from their strikes and saves the small summary on their profile. */
export async function refreshStanding(db: Firestore, uid: string, now = Date.now()) {
  const snap = await db.collection('strikes').where('uid', '==', uid).get()
  const list = snap.docs.map(docOf)
  const level = levelOf(list, now), until = bannedUntilOf(list, now)
  const live = list.filter(s => counts(s, now)), last = live.length ? Math.max(...live.map(s => s.expiresAt ?? 0)) : 0
  await db.collection('users').doc(uid).set({
    strikeLevel: level, strikeUntil: last ? Timestamp.fromMillis(last) : FieldValue.delete(), bannedUntil: until ? until : FieldValue.delete(),
  }, { merge: true })
  return { level, bannedUntil: until }
}

/** GET /api/me/standing */
export async function standingFor(db: Firestore, uid: string, now = Date.now()) {
  return standingOf((await db.collection('strikes').where('uid', '==', uid).get()).docs.map(docOf), now)
}

export async function decideStrike(db: Firestore, id: string, action: 'confirm' | 'excuse', note: string, by: string, now = Date.now()) {
  const ref = db.collection('strikes').doc(id)
  const rules = await loadStudioRules(db)
  const expiresAt = semesterEndMs(rules.semesterEnd)
  if (action === 'confirm' && expiresAt <= now) throw new HttpError(400, 'The semester end date in Settings has passed. Set the new date before confirming a strike.')
  const s = await db.runTransaction(async tx => {
    const d = await tx.get(ref)
    if (!d.exists) throw new HttpError(404, 'Strike not found.', 'BR-STR-002')
    const st = String(d.get('status'))
    // Confirm only a pending flag. Excusing a confirmed strike is how the E-board lifts a ban or takes a strike back.
    if (action === 'confirm' ? st !== 'pending' : st !== 'pending' && st !== 'confirmed') throw new HttpError(409, 'This strike was already decided.', 'BR-STR-002')
    tx.update(ref, {
      status: action === 'confirm' ? 'confirmed' : 'excused', decidedBy: by, decidedAt: Timestamp.fromMillis(now),
      ...(note ? { note: note.slice(0, 300) } : {}), ...(action === 'confirm' ? { expiresAt: Timestamp.fromMillis(expiresAt) } : { expiresAt: FieldValue.delete() }),
    })
    return docOf(d)
  })
  const st = await refreshStanding(db, s.uid, now)
  if (action === 'confirm') await mailStrike(db, s, st.level, st.bannedUntil, expiresAt)
  return { ok: true, uid: s.uid, level: st.level, bannedUntil: st.bannedUntil }
}

async function mailStrike(db: Firestore, s: StrikeDoc, level: number, bannedUntil: number | null, expiresAt: number) {
  const u = await db.collection('users').doc(s.uid).get()
  const to = String(u.get('email') ?? '')
  if (!to) return
  const until = new Date(bannedUntil ?? expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
  const m = strikeMail({ kind: emailKindFor(level), reason: (KIND_TEXT[s.kind as StrikeKind] ?? 'a strike').toLowerCase(), until })
  after(() => sendMail(to, m.subject, m.text, m.html))
}

/** Pending first (up to 100), then the latest 50 that were decided. */
export async function listStrikes(db: Firestore) {
  const [pend, done] = await Promise.all([
    db.collection('strikes').where('status', '==', 'pending').limit(100).get(),
    db.collection('strikes').orderBy('at', 'desc').limit(80).get(),
  ])
  const seen = new Set(pend.docs.map(d => d.id))
  const rows = [...pend.docs.map(docOf).sort((a, b) => b.at - a.at), ...done.docs.filter(d => !seen.has(d.id) && d.get('status') !== 'pending').slice(0, 50).map(docOf)]
  const uids = [...new Set(rows.map(r => r.uid))]
  const users = uids.length ? await db.getAll(...uids.map(u => db.collection('users').doc(u)), { fieldMask: ['firstName', 'lastName', 'email'] }) : []
  const who = new Map(users.map(u => [u.id, { name: [u.get('firstName'), u.get('lastName')].filter(Boolean).join(' ') || '(no name)', email: String(u.get('email') ?? '') }]))
  return rows.map(r => ({ ...r, name: who.get(r.uid)?.name ?? '', email: who.get(r.uid)?.email ?? '', reason: KIND_TEXT[r.kind as StrikeKind] ?? 'Strike' }))
}

// ── detection ──────────────────────────────────────────────
let lastScan = 0
const HOUR = 3_600_000

/**
 * Flags missed shows. Runs inside the existing 15-minute auto-approval run and when the strikes page opens, at most once every 10 minutes
 * (an `ops/strikeScan` document keeps that across server instances). It only ever writes pending strikes.
 *  - Live show: no studio-PC go-live (boothSessions) and no streamer in the AzuraCast history during the slot.
 *  - Pre-recorded show: it started with no audio link and no recording attached.
 */
export async function scanStrikes(db: Firestore, now = Date.now()): Promise<{ flagged: number } | null> {
  if (now - lastScan < 10 * 60_000) return null
  lastScan = now
  const mark = db.collection('ops').doc('strikeScan')
  const prev = Number((await mark.get()).get('at') ?? 0)
  if (now - prev < 10 * 60_000) return null
  await mark.set({ at: now })
  let flagged = 0
  const since = Timestamp.fromMillis(now - 48 * HOUR)

  const lives = (await db.collection('airSlots').where('endAt', '>', since).where('endAt', '<=', Timestamp.fromMillis(now - 10 * 60_000)).get()).docs.filter(d => d.get('type') === 'live')
  if (lives.length) {
    const sess = (await db.collection('boothSessions').where('startedAt', '>=', Timestamp.fromMillis(now - 72 * HOUR)).get()).docs
    const signals = sess.filter(d => Number(d.get('liveCount') ?? 0) > 0 && d.get('firstLiveAt')).map(d => ({
      from: (d.get('firstLiveAt') as Timestamp).toMillis(), to: ((d.get('lastSeenAt') as Timestamp | undefined)?.toMillis() ?? (d.get('firstLiveAt') as Timestamp).toMillis()),
    }))
    for (const d of lives) {
      const slot = { startAt: (d.get('startAt') as Timestamp).toMillis(), endAt: (d.get('endAt') as Timestamp).toMillis() }
      if (!liveNoShow(slot, signals, now)) continue
      // A host streaming from their own gear leaves no studio-PC record: the stream history says whether a streamer was on.
      if (azuraConfigured()) {
        try { if ((await azHistory(slot.startAt, slot.endAt)).some(r => r.streamer)) continue } catch { continue } // cannot check: do not flag
      }
      if (await flagStrike(db, { uid: String(d.get('requesterUid')), kind: 'live-no-show', refId: d.id, title: String(d.get('title') ?? ''), at: slot.startAt, note: 'No connection was seen during the live slot.' })) flagged++
    }
  }

  const pres = (await db.collection('airSlots').where('startAt', '>', since).where('startAt', '<=', Timestamp.fromMillis(now - 5 * 60_000)).get()).docs.filter(d => d.get('type') === 'prerecorded')
  if (pres.length) {
    const reqs = await db.getAll(...pres.map(d => db.collection('slotRequests').doc(d.id)), { fieldMask: ['audioURL', 'attachedRecordingId'] })
    const by = new Map(reqs.map(r => [r.id, r]))
    for (const d of pres) {
      const r = by.get(d.id)
      if (!r?.exists) continue
      const startAt = (d.get('startAt') as Timestamp).toMillis()
      if (!prerecordedNoAudio({ startAt, audioURL: String(r.get('audioURL') ?? ''), recordingId: String(r.get('attachedRecordingId') ?? '') }, now)) continue
      if (await flagStrike(db, { uid: String(d.get('requesterUid')), kind: 'prerecorded-no-show', refId: d.id, title: String(d.get('title') ?? ''), at: startAt, note: 'The show started with no audio attached.' })) flagged++
    }
  }
  return { flagged }
}
