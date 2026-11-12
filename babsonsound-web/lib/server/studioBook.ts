import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { HttpError } from './http'
import { accessOf } from './access'
import { overlapQuery } from './slots'
import { loadStudioRules } from './studioRules'
import { flagStrike } from './strikes'
import { sendMail, studioReleasedMail } from './mailer'
import { whenText } from './slotApproval'
import { isBanned } from '../strikesCore'
import {
  POLICY_VERSION, QUIET_WARNING, checkBookingTime, freeCancel, holdsRoom, holdsStudio, isReleasable, maskEmail, nameLower, overlaps, purgeAtMs, quietInfo, quietRanges, quietAt, quietUntil, quietNextStart,
  upcomingHeld, withinCapacity, type Guest, type GuestInput,
} from '../studioBookCore'

// Studio bookings (collection `studioBookings`, admin SDK only). Instant confirm, no approval. Conflict checks run inside a transaction.
// A live show holds the studio unless its request says noStudio: true, so a booking cannot overlap one, and a live request cannot overlap a booking.

export interface BookingRow {
  id: string; uid: string; name: string; startAt: number; endAt: number; durationMin: number; status: string
  guests: Guest[]; justMe: boolean; quiet: boolean; checkedInAt: number | null
}
const ms = (v: unknown) => (v as Timestamp | undefined)?.toMillis?.() ?? 0
export const rowOf = (d: FirebaseFirestore.DocumentSnapshot): BookingRow => ({
  id: d.id, uid: String(d.get('uid') ?? ''), name: String(d.get('name') ?? ''), startAt: ms(d.get('startAt')), endAt: ms(d.get('endAt')),
  durationMin: Number(d.get('durationMin') ?? 0), status: String(d.get('status') ?? ''), guests: (d.get('guests') as Guest[] | undefined) ?? [],
  justMe: d.get('justMe') === true, quiet: d.get('quiet') === true, checkedInAt: ms(d.get('checkedInAt')) || null,
})

/** The person must hold an active Studio badge (E-board and Admin always do). */
export async function requireStudioBadge(t: DecodedIdToken) {
  const a = await accessOf(t)
  if (a.level === 'guest') throw new HttpError(403, 'Studio booking is for Babson, Olin and Wellesley members.', 'BR-PERM-001')
  if (!a.studio) throw new HttpError(403, a.studioExpired ? 'Your studio training has ended. Renew it to book the studio.' : 'Finish studio training to book the studio.', 'BR-BKG-007')
  return a
}

/** A ban from three confirmed strikes pauses new show requests and studio bookings. */
export function assertNotBanned(user: FirebaseFirestore.DocumentSnapshot, now: number) {
  const v = user.get('bannedUntil')
  const until = typeof v === 'number' ? v : 0
  if (isBanned(until, now)) {
    const d = new Date(until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
    throw new HttpError(403, `New show requests and studio bookings are paused until ${d}. Talk to the E-board if you think this is a mistake.`, 'BR-STR-001')
  }
}

// ── guests ─────────────────────────────────────────────────
const ghash = (email: string) => createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)
const HISTORY = (db: Firestore, uid: string) => db.collection('guestHistory').doc(uid)
type Past = { name: string; email: string; at: number }

/** Past guests of this person (their own history, up to 50), newest first. */
export async function pastGuests(db: Firestore, uid: string): Promise<Past[]> {
  const l = (await HISTORY(db, uid).get()).get('list')
  return Array.isArray(l) ? (l as Past[]) : []
}

/**
 * Turns what the client sent into real guests. A typed guest keeps its name and email. A guest picked from the suggestions arrives as an id
 * ('g:' + a past guest of this person, 'u:' + a member): the server looks the email up itself, so a member's email is never sent to a browser.
 */
export async function resolveGuests(db: Firestore, uid: string, input: GuestInput[]): Promise<Guest[]> {
  const out: Guest[] = [], seen = new Set<string>()
  let past: Past[] | null = null
  for (const g of input) {
    let guest: Guest | null = null
    if (!g.id) guest = { name: g.name, email: g.email }
    else if (g.id.startsWith('g:')) {
      past ??= await pastGuests(db, uid)
      const p = past.find(x => ghash(x.email) === g.id!.slice(2))
      if (p) guest = { name: p.name, email: p.email }
    } else if (g.id.startsWith('u:')) {
      const u = await db.collection('users').doc(g.id.slice(2)).get()
      const email = String(u.get('email') ?? '')
      if (u.exists && email && u.get('level') !== 'guest' && u.get('suggestable') !== false) {
        guest = { name: [u.get('firstName'), u.get('lastName')].filter(Boolean).join(' ').slice(0, 60) || 'Member', email: email.toLowerCase(), uid: u.id }
      }
    }
    if (!guest) throw new HttpError(400, 'One of the guests could not be found. Pick them again or type their email.', 'BR-BKG-004')
    if (seen.has(guest.email)) continue
    seen.add(guest.email); out.push(guest)
  }
  return out
}

/** Keeps the guests for the type-ahead (the person's own list, 50 at most). */
export async function rememberGuests(db: Firestore, uid: string, guests: Guest[], now = Date.now()) {
  if (!guests.length) return
  const old = await pastGuests(db, uid)
  const fresh = guests.map(g => ({ name: g.name, email: g.email, at: now }))
  const keep = [...fresh, ...old.filter(o => !fresh.some(f => f.email === o.email))].slice(0, 50)
  await HISTORY(db, uid).set({ list: keep })
}
export { ghash, maskEmail, nameLower }

// ── booking ────────────────────────────────────────────────
export async function bookStudio(db: Firestore, t: DecodedIdToken, i: { startMs: number; durationMin: number; guests: Guest[]; justMe: boolean; now?: number }) {
  const now = i.now ?? Date.now()
  const rules = await loadStudioRules(db)
  const bad = checkBookingTime({ startMs: i.startMs, durationMin: i.durationMin, now, rules })
  if (bad) throw new HttpError(bad.status, bad.message, 'BR-BKG-001')
  if (!withinCapacity(i.guests.length, rules.capacity)) throw new HttpError(400, `With you in the room, at most ${rules.capacity} people fit.`, 'BR-BKG-004')
  const user = await db.collection('users').doc(t.uid).get()
  assertNotBanned(user, now)
  const start = i.startMs, end = i.startMs + i.durationMin * 60_000
  const ref = db.collection('studioBookings').doc()
  const info = quietInfo(rules.quiet, start, end)
  await db.runTransaction(async tx => {
    const lookBack = Timestamp.fromMillis(start - rules.maxMinutes * 60_000)
    const [near, mine, slots, pend] = await Promise.all([
      tx.get(db.collection('studioBookings').where('startAt', '>=', lookBack).where('startAt', '<', Timestamp.fromMillis(end))),
      tx.get(db.collection('studioBookings').where('uid', '==', t.uid)),
      tx.get(overlapQuery(db, new Date(start), new Date(end))),
      tx.get(db.collection('slotRequests').where('status', '==', 'pending')),
    ])
    const span = (d: FirebaseFirestore.DocumentSnapshot) => ({ startAt: ms(d.get('startAt')), endAt: ms(d.get('endAt')) })
    const me = { startAt: start, endAt: end }
    if (near.docs.some(d => holdsRoom({ status: String(d.get('status')), ...span(d) }) && overlaps(span(d), me))) throw new HttpError(409, 'The studio is already booked then. Pick another time.', 'BR-BKG-002')
    if (slots.docs.some(d => holdsStudio({ type: String(d.get('type')), noStudio: d.get('noStudio') }) && overlaps(span(d), me))) throw new HttpError(409, 'A live show has the studio then. Pick another time.', 'BR-BKG-002')
    if (pend.docs.some(d => holdsStudio({ type: String(d.get('type')), noStudio: d.get('noStudio') }) && overlaps(span(d), me))) throw new HttpError(409, 'A live show request is waiting for that time. Pick another time.', 'BR-BKG-002')
    if (upcomingHeld(mine.docs.map(d => ({ status: String(d.get('status')), ...span(d) })), now) >= rules.maxHolds) {
      throw new HttpError(409, `You can hold ${rules.maxHolds} studio bookings at a time. Cancel one or wait until one has passed.`, 'BR-BKG-003')
    }
    tx.set(ref, {
      uid: t.uid, name: [user.get('firstName'), user.get('lastName')].filter(Boolean).join(' ') || String(user.get('displayName') ?? 'Member'), email: t.email ?? '',
      startAt: Timestamp.fromMillis(start), endAt: Timestamp.fromMillis(end), durationMin: i.durationMin, guests: i.guests, justMe: i.justMe,
      status: 'booked', policyAck: true, policyVersion: POLICY_VERSION, quiet: info.quiet, createdAt: Timestamp.fromMillis(now),
      ...(i.guests.length ? { purgeAt: Timestamp.fromMillis(purgeAtMs(start)) } : {}),
    })
  })
  after(() => rememberGuests(db, t.uid, i.guests, now).catch(() => {}))
  return { id: ref.id, startAt: start, endAt: end, durationMin: i.durationMin, status: 'booked', quiet: info.quiet, warning: info.warning }
}

export async function cancelBooking(db: Firestore, t: DecodedIdToken, id: string, now = Date.now()) {
  const rules = await loadStudioRules(db)
  const ref = db.collection('studioBookings').doc(id)
  const r = await db.runTransaction(async tx => {
    const d = await tx.get(ref)
    if (!d.exists || d.get('uid') !== t.uid) throw new HttpError(404, 'Booking not found.', 'BR-BKG-006')
    if (d.get('status') !== 'booked') throw new HttpError(409, 'This booking can no longer be cancelled.', 'BR-BKG-006')
    const start = ms(d.get('startAt'))
    if (start <= now) throw new HttpError(400, 'That booking has already started.', 'BR-BKG-006')
    tx.update(ref, { status: 'cancelled', cancelledAt: Timestamp.fromMillis(now), guests: FieldValue.delete(), purgeAt: FieldValue.delete() })
    return { start, late: !freeCancel(start, now, rules.cancelHours) }
  })
  // Cancelling inside the free-cancel window is flagged for review only when studio strikes are switched on (default off).
  if (r.late && rules.studioNoShow) await flagStrike(db, { uid: t.uid, kind: 'late-cancel', refId: `studio-${id}`, title: 'Studio booking', at: r.start, note: `Cancelled less than ${rules.cancelHours} hours before.` }).catch(() => {})
  return { ok: true, late: r.late }
}

/** Is the studio booked by a person (not a show) for any part of [start, end)? Used when a live show asks for the studio. */
export async function studioBusy(db: Firestore, start: number, end: number): Promise<boolean> {
  const rules = await loadStudioRules(db)
  const snap = await db.collection('studioBookings').where('startAt', '>=', Timestamp.fromMillis(start - rules.maxMinutes * 60_000)).where('startAt', '<', Timestamp.fromMillis(end)).get()
  return snap.docs.some(d => holdsRoom({ status: String(d.get('status')), startAt: ms(d.get('startAt')), endAt: ms(d.get('endAt')) }) && ms(d.get('endAt')) > start)
}

// ── release and complete (lazy: no cron) ───────────────────
let lastRelease = 0
/**
 * A booked block nobody checked in to, past the grace period, becomes `released` (the person gets a friendly email; a strike is flagged only when
 * strikes.studioNoShow is on). A checked-in booking whose time is over becomes `completed`. Runs when the grid, My bookings or the booth endpoint is read,
 * at most once a minute per server instance, over the last 48 hours of bookings (one indexed range read).
 */
export async function releaseStale(db: Firestore, now = Date.now()): Promise<number> {
  if (now - lastRelease < 60_000) return 0
  lastRelease = now
  const rules = await loadStudioRules(db)
  const snap = await db.collection('studioBookings').where('startAt', '>=', Timestamp.fromMillis(now - 48 * 3_600_000)).where('startAt', '<=', Timestamp.fromMillis(now)).get()
  let n = 0
  for (const d of snap.docs) {
    const b = { status: String(d.get('status')), startAt: ms(d.get('startAt')), endAt: ms(d.get('endAt')) }
    if (b.status === 'checked-in' && b.endAt <= now) { await d.ref.update({ status: 'completed' }).catch(() => {}); continue }
    if (!isReleasable(b, now, rules.graceMinutes)) continue
    const freed = await db.runTransaction(async tx => {
      const cur = await tx.get(d.ref)
      if (cur.get('status') !== 'booked') return false
      tx.update(d.ref, { status: 'released', releasedAt: Timestamp.fromMillis(now), guests: FieldValue.delete(), purgeAt: FieldValue.delete() })
      return true
    })
    if (!freed) continue
    n++
    const to = String(d.get('email') ?? '')
    if (to) { const m = studioReleasedMail({ when: whenText(b.startAt) }); await sendMail(to, m.subject, m.text, m.html) }
    if (rules.studioNoShow) await flagStrike(db, { uid: String(d.get('uid')), kind: 'studio-no-show', refId: d.id, title: 'Studio booking', at: b.startAt, note: 'Nobody checked in within the grace period.' }).catch(() => {})
  }
  return n
}
export const resetRelease = () => { lastRelease = 0 }

/** GET /api/studio/mine: this person's own bookings, upcoming first. */
export async function myBookings(db: Firestore, uid: string, now = Date.now()) {
  await releaseStale(db, now).catch(e => console.error('[studio release]', e))
  const rows = (await db.collection('studioBookings').where('uid', '==', uid).get()).docs.map(rowOf)
  const rules = await loadStudioRules(db)
  const upcoming = rows.filter(r => holdsRoom(r) && r.endAt > now).sort((a, b) => a.startAt - b.startAt)
  const past = rows.filter(r => !upcoming.includes(r)).sort((a, b) => b.startAt - a.startAt).slice(0, 20)
  return { upcoming, past, held: upcoming.length, maxHolds: rules.maxHolds }
}

// ── the grid: booked ranges only ───────────────────────────
const gridCache = new Map<string, { at: number; v: unknown }>()
export const resetGridCache = () => gridCache.clear()

/**
 * Booked ranges for the grid (bookings, live shows that hold the studio, pending live requests), no names, at most 14 days. Kept 60 s per server
 * instance for everyone, since it has nothing personal in it. Also the quiet stretches and the rules the grid needs.
 */
export async function openGrid(db: Firestore, fromMs: number, toMs: number, now = Date.now()) {
  const key = `${Math.floor(fromMs / 60_000)}-${Math.floor(toMs / 60_000)}`
  const hit = gridCache.get(key)
  if (hit && now - hit.at < 60_000) return hit.v
  await releaseStale(db, now).catch(e => console.error('[studio release]', e))
  const rules = await loadStudioRules(db)
  const lookBack = Timestamp.fromMillis(fromMs - Math.max(rules.maxMinutes, 240) * 60_000)
  const [bk, slots, pend] = await Promise.all([
    db.collection('studioBookings').where('startAt', '>=', lookBack).where('startAt', '<', Timestamp.fromMillis(toMs)).get(),
    db.collection('airSlots').where('startAt', '>=', lookBack).where('startAt', '<', Timestamp.fromMillis(toMs)).get(),
    db.collection('slotRequests').where('status', '==', 'pending').get(),
  ])
  const span = (d: FirebaseFirestore.DocumentSnapshot) => ({ startAt: ms(d.get('startAt')), endAt: ms(d.get('endAt')) })
  const live = (d: FirebaseFirestore.DocumentSnapshot) => holdsStudio({ type: String(d.get('type')), noStudio: d.get('noStudio') })
  const ranges = [
    ...bk.docs.filter(d => holdsRoom({ status: String(d.get('status')), ...span(d) })).map(span),
    ...slots.docs.filter(live).map(span),
    ...pend.docs.filter(live).map(span),
  ].filter(r => r.endAt > fromMs && r.startAt < toMs).sort((a, b) => a.startAt - b.startAt)
  const v = {
    from: fromMs, to: toMs, ranges, quietRanges: quietRanges(rules.quiet, fromMs, toMs), quiet: quietAt(rules.quiet, now), warning: QUIET_WARNING,
    rules: { openHour: rules.openHour, closeHour: rules.closeHour, stepMinutes: 30, minMinutes: rules.minMinutes, maxMinutes: rules.maxMinutes, maxHolds: rules.maxHolds, lookAheadDays: rules.lookAheadDays, cancelHours: rules.cancelHours, capacity: rules.capacity },
  }
  if (gridCache.size > 40) gridCache.clear()
  gridCache.set(key, { at: now, v })
  return v
}

// ── booth (studio PC) ──────────────────────────────────────
let statusCache: { at: number; v: unknown } | null = null
/**
 * What the studio PC page shows: the next booking (or the one running), whether it is quiet hours, and the capacity. Kept 60 s per server instance;
 * the page asks when it opens and at most every 5 minutes.
 */
export async function boothStudioStatus(db: Firestore, now = Date.now()) {
  if (statusCache && now - statusCache.at < 60_000) return statusCache.v
  await releaseStale(db, now).catch(e => console.error('[studio release]', e))
  const rules = await loadStudioRules(db)
  const snap = await db.collection('studioBookings').where('startAt', '>=', Timestamp.fromMillis(now - rules.maxMinutes * 60_000)).orderBy('startAt').limit(12).get()
  // First names only. The page shows "Booked now by …" and "Next booking: …"; it never blocks a walk-in.
  const held = snap.docs.map(rowOf).filter(r => holdsRoom(r) && r.endAt > now).slice(0, 3)
    .map(r => ({ id: r.id, startAt: r.startAt, endAt: r.endAt, name: r.name.split(' ')[0] || r.name }))
  const q = quietAt(rules.quiet, now)
  const v = {
    nextBooking: held[0] ?? null, bookings: held,
    quiet: q, quietUntil: quietUntil(rules.quiet, now), quietStartsAt: quietNextStart(rules.quiet, now), capacity: rules.capacity, ...(q ? { warning: QUIET_WARNING } : {}),
  }
  statusCache = { at: now, v }
  return v
}
export const resetBoothStatus = () => { statusCache = null }

/** The person's booking for right now (from 15 minutes before it starts until it ends) becomes checked in. A walk-in has no booking: nothing happens. */
export async function checkInNow(db: Firestore, uid: string, now = Date.now()) {
  const rows = (await db.collection('studioBookings').where('uid', '==', uid).get()).docs.map(rowOf)
  const open = rows.filter(r => holdsRoom(r) && now >= r.startAt - 15 * 60_000 && now < r.endAt).sort((a, b) => a.startAt - b.startAt)
  const mine = open.find(r => r.status === 'booked')
  // Already checked in (signed in again, or another tab): nothing to change, but the page still needs to know whose booking it is.
  if (!mine) return open[0] ? { ok: true, checkedIn: false, bookingId: open[0].id } : { ok: true, checkedIn: false }
  const done = await db.runTransaction(async tx => {
    const d = await tx.get(db.collection('studioBookings').doc(mine.id))
    if (d.get('status') !== 'booked') return false
    tx.update(d.ref, { status: 'checked-in', checkedInAt: Timestamp.fromMillis(now) })
    return true
  })
  if (done) resetBoothStatus()
  return { ok: true, checkedIn: done, bookingId: mine.id }
}
