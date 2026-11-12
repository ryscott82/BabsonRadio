import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { scanStrikes } from './strikes'
import { finishRecordings } from './recordings'
import { releaseStale } from './studioBook'

// Small jobs that must happen sometimes but are not worth a cron (Hobby has two and both are used). They run inside runs that already exist: the free
// outside pinger on /api/cron/slots-auto (every 15 minutes), the daily crons, and the strikes page. Each one is throttled and bounded.
let lastPurge = 0

/** Deletes guest names and emails 90 days after the date of the booking or show (collection field `purgeAt`, one indexed range read per collection). */
export async function purgeGuests(db: Firestore, now = Date.now()): Promise<number> {
  if (now - lastPurge < 6 * 3_600_000) return 0
  lastPurge = now
  let n = 0
  for (const col of ['studioBookings', 'slotRequests']) {
    const snap = await db.collection(col).where('purgeAt', '<=', Timestamp.fromMillis(now)).limit(100).get()
    for (const d of snap.docs) { await d.ref.update({ guests: [], purgeAt: FieldValue.delete(), guestsPurgedAt: Timestamp.fromMillis(now) }); n++ }
  }
  return n
}

export async function runHousekeeping(db: Firestore, now = Date.now()) {
  const out: Record<string, unknown> = {}
  const step = async (name: string, f: () => Promise<unknown>) => { try { out[name] = await f() } catch (e) { console.error(`[housekeeping ${name}]`, e); out[name] = 'error' } }
  await step('strikes', () => scanStrikes(db, now))
  await step('studio', () => releaseStale(db, now))
  await step('guests', () => purgeGuests(db, now))
  await step('recordings', () => finishRecordings(db, now))
  return out
}
