import 'server-only'
import { STAFF_ONLY } from '../roleLabel'
import { FieldValue, Timestamp, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { randomBytes } from 'node:crypto'
import { adminAuth } from './admin'
import { HttpError, requireUser } from './http'
import { accessOf, forgetAccess, isOwnerEmail, type Access } from './access'
import { SITE_URL } from '../links'
import {
  BADGES, badgeActive, badgeExpiry, effectiveStatus, freshGuard, guardFail, guardStep, isTrainerLevel, memberGate,
  type Badge, type Gate, type Guard, type SessionStatus,
} from '../studioRules'

// Studio training: sessions, attendance, grants. Everything here is admin SDK only (rules deny every client).

export const ms = (v: unknown): number | null => (v as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null
const msOr0 = (v: unknown) => ms(v) ?? 0

export const sessionsCol = (db: Firestore) => db.collection('trainingSessions')
export const attendanceId = (sessionId: string, uid: string) => `${sessionId}_${uid}`

// ── who is calling ──

export interface Actor { t: DecodedIdToken; a: Access }

/**
 * Every Studio route starts here, so a Guest always gets 403 BR-PERM-001. `need` = 'student' (any member), 'staff' (director or admin)
 * or 'admin'.
 */
export async function studioActor(req: Request, need: 'student' | 'staff' | 'admin' = 'student'): Promise<Actor> {
  const t = await requireUser(req)
  const a = await accessOf(t)
  const g = memberGate(a.level)
  if (!g.ok) throw new HttpError(g.status, g.message, g.code)
  if (need === 'staff' && !isTrainerLevel(a.level)) throw new HttpError(403, STAFF_ONLY, 'BR-PERM-002')
  if (need === 'admin' && a.level !== 'admin') throw new HttpError(403, 'Admins only.', 'BR-PERM-002')
  return { t, a }
}

/** Turn a failed gate (lib/studioRules.ts) into the HTTP error. */
export function must(g: Gate) {
  if (!g.ok) throw new HttpError(g.status, g.message, g.code)
}

/** Is this person a Director or an Admin right now? Reads their profile (an owner address with a verified email counts as admin). */
export async function isTrainerUid(db: Firestore, uid: string): Promise<boolean> {
  const u = await db.collection('users').doc(uid).get()
  if (!u.exists) return false
  if (isTrainerLevel(u.get('level'))) return true
  const email = String(u.get('email') ?? '')
  if (!isOwnerEmail(email)) return false
  try { return (await adminAuth().getUser(uid)).emailVerified === true } catch { return false }
}

// ── sessions ──

export interface SessionRow {
  id: string; covers: Badge[]; title: string; startsAt: number; endsAt: number; location: string; capacity: number
  trainerUid: string; status: SessionStatus; checkinSecret: string; rsvpCount: number
}

export function readSession(d: DocumentSnapshot): SessionRow {
  return {
    id: d.id, covers: (d.get('covers') ?? []).filter((b: string) => BADGES.includes(b as Badge)) as Badge[], title: String(d.get('title') ?? ''),
    startsAt: msOr0(d.get('startsAt')), endsAt: msOr0(d.get('endsAt')), location: String(d.get('location') ?? ''), capacity: Number(d.get('capacity') ?? 0),
    trainerUid: String(d.get('trainerUid') ?? ''), status: (d.get('status') ?? 'scheduled') as SessionStatus,
    checkinSecret: String(d.get('checkinSecret') ?? ''), rsvpCount: Number(d.get('rsvpCount') ?? 0),
  }
}

export async function loadSession(db: Firestore, id: string): Promise<SessionRow> {
  const d = id ? await sessionsCol(db).doc(id).get() : null
  if (!d || !d.exists) throw new HttpError(404, 'That training session was not found.', 'BR-STU-001')
  return readSession(d)
}

/** The checkinSecret never leaves the server: this is the only shape sent to a browser or the app. */
export function publicSession(s: SessionRow, now: number, trainerName = '') {
  return {
    id: s.id, covers: s.covers, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, location: s.location, capacity: s.capacity,
    trainerUid: s.trainerUid, trainerName, status: effectiveStatus(s, now), rsvpCount: s.rsvpCount,
  }
}

export const newSecret = () => randomBytes(32).toString('hex')

/** Only the named trainer or an Admin can open or close check-in, see the code, remove people and confirm. */
export function assertCanManage(s: SessionRow, { t, a }: Actor) {
  if (a.level === 'admin' || (isTrainerLevel(a.level) && s.trainerUid === t.uid)) return
  throw new HttpError(403, 'Only the trainer for this session can do that.', 'BR-STU-003')
}

/** Write the closed status when the auto-close time has passed, so the document matches what everyone has been told. */
export async function settleStatus(db: Firestore, s: SessionRow, now: number): Promise<SessionRow> {
  const st = effectiveStatus(s, now)
  if (st !== s.status) { await sessionsCol(db).doc(s.id).update({ status: st }); return { ...s, status: st } }
  return s
}

export const deepLink = (sessionId: string, code: string) => `${SITE_URL}/studio/checkin?session=${encodeURIComponent(sessionId)}&code=${code}`

/** Names for a list of uids: "First Last" (or the first name / email), one batched read. */
export async function namesFor(db: Firestore, uids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>()
  const ids = [...new Set(uids.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 100) {
    const docs = await db.getAll(...ids.slice(i, i + 100).map(id => db.collection('users').doc(id)))
    docs.forEach(d => {
      const name = [d.get('firstName') ?? d.get('displayName') ?? '', d.get('lastName') ?? ''].join(' ').trim()
      out.set(d.id, { name: name || String(d.get('email') ?? '') || 'Someone', email: String(d.get('email') ?? '') })
    })
  }
  return out
}

// ── check-in tries ──

/** Counts one try (5 a minute, locked 15 minutes after 10 wrong codes). One read and one write. */
export async function countTry(db: Firestore, uid: string, now: number): Promise<number> {
  const ref = db.collection('trainingCheckinGuard').doc(uid)
  const verdict = await db.runTransaction(async tx => {
    const d = await tx.get(ref)
    const g: Guard = d.exists ? { windowStart: Number(d.get('windowStart') ?? 0), tries: Number(d.get('tries') ?? 0), fails: Number(d.get('fails') ?? 0), lockUntil: Number(d.get('lockUntil') ?? 0) } : freshGuard()
    const r = guardStep(g, now)
    if (r.ok) tx.set(ref, { ...r.guard, uid, expireAt: Timestamp.fromMillis(now + 2 * 3_600_000) })
    return r
  })
  if (!verdict.ok) {
    const mins = Math.max(1, Math.ceil(verdict.retrySec / 60))
    throw new HttpError(429, verdict.why === 'locked'
      ? `Too many wrong codes. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
      : 'Slow down a little. Try again in a minute.', verdict.why === 'locked' ? 'BR-STU-006' : 'BR-STU-005')
  }
  return verdict.guard.fails // wrong codes so far, so a right code knows whether there is anything to clear
}

/** A wrong code: count it, and log it (and the lock when it happens). */
export async function recordWrongCode(db: Firestore, uid: string, sessionId: string, now: number): Promise<void> {
  const ref = db.collection('trainingCheckinGuard').doc(uid)
  const locked = await db.runTransaction(async tx => {
    const d = await tx.get(ref)
    const g: Guard = d.exists ? { windowStart: Number(d.get('windowStart') ?? 0), tries: Number(d.get('tries') ?? 0), fails: Number(d.get('fails') ?? 0), lockUntil: Number(d.get('lockUntil') ?? 0) } : freshGuard()
    const next = guardFail(g, now)
    tx.set(ref, { ...next, uid, expireAt: Timestamp.fromMillis(now + 2 * 3_600_000) })
    return next.lockUntil > g.lockUntil
  })
  await db.collection('trainingCheckinLog').add({ uid, sessionId, kind: locked ? 'locked' : 'wrong_code', at: Timestamp.fromMillis(now), expireAt: Timestamp.fromMillis(now + 90 * 86_400_000) })
  if (locked) console.warn(`[studio] check-in locked for ${uid} on session ${sessionId}`)
}

/** A right code clears the wrong-code count. */
export async function clearWrongCodes(db: Firestore, uid: string): Promise<void> {
  await db.collection('trainingCheckinGuard').doc(uid).update({ fails: 0 })
}

// ── badges ──

export interface NewGrant {
  uid: string; badge: Badge; sessionId: string; trainerUid: string; quizId: string; quizScore: number | null; agreementVersion: string | null
  grantedBy: 'system' | string; reason?: string; expiresAt?: number
}

/**
 * Add the grants (append only) and put the badge on the person's profile. The grant id is stable for a session's own grants
 * (sessionId_uid_badge) so a repeated request cannot make a second one; manual grants get a fresh id.
 * Returns the badges actually granted now.
 */
export async function writeGrants(db: Firestore, grants: NewGrant[], now: number, stableIds: boolean): Promise<Badge[]> {
  const done: Badge[] = []
  for (const g of grants) {
    const grantedAt = Timestamp.fromMillis(now)
    const expires = g.expiresAt ?? badgeExpiry(now)
    const ref = stableIds ? db.collection('trainingGrants').doc(`${g.sessionId}_${g.uid}_${g.badge}`) : db.collection('trainingGrants').doc()
    const userRef = db.collection('users').doc(g.uid)
    const created = await db.runTransaction(async tx => {
      if (stableIds && (await tx.get(ref)).exists) return false
      const u = await tx.get(userRef)
      const cur = ms(u.get(`${g.badge}ExpiresAt`))
      const keep = u.get(`${g.badge}Trained`) === true && cur != null && cur > expires ? cur : expires // never shorten a badge that already runs longer
      tx.create(ref, {
        uid: g.uid, badge: g.badge, sessionId: g.sessionId, trainerUid: g.trainerUid, quizId: g.quizId, quizScore: g.quizScore,
        agreementVersion: g.agreementVersion, grantedAt, expiresAt: Timestamp.fromMillis(expires), grantedBy: g.grantedBy, ...(g.reason ? { reason: g.reason } : {}),
      })
      tx.update(userRef, { [`${g.badge}Trained`]: true, [`${g.badge}ExpiresAt`]: Timestamp.fromMillis(keep) })
      return true
    })
    if (created) done.push(g.badge)
  }
  if (grants.length) forgetAccess(grants[0].uid)
  return done
}

/** Set the profile badge from what is left after a revoke: the longest grant that is not revoked and not expired. */
export async function refreshBadge(db: Firestore, uid: string, badge: Badge, now: number): Promise<void> {
  const snap = await db.collection('trainingGrants').where('uid', '==', uid).get()
  let best: number | null = null
  for (const d of snap.docs) {
    if (d.get('badge') !== badge || d.get('revokedAt') != null) continue
    const e = ms(d.get('expiresAt'))
    if (e != null && badgeActive(e, now) && (best == null || e > best)) best = e
  }
  await db.collection('users').doc(uid).update(best == null
    ? { [`${badge}Trained`]: false, [`${badge}ExpiresAt`]: FieldValue.delete() }
    : { [`${badge}Trained`]: true, [`${badge}ExpiresAt`]: Timestamp.fromMillis(best) })
  forgetAccess(uid)
}

