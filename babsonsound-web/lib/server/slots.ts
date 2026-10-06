import 'server-only'
import { Timestamp, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore'
import { SLOT_RULES } from '../slots'

/** Approved slots overlapping [start, end). Slots are ≤ maxMinutes long, so look back that far. */
export function overlapQuery(db: Firestore, start: Date, end: Date): Query {
  const lookBack = new Date(start.getTime() - SLOT_RULES.maxMinutes * 60_000)
  return db.collection('airSlots')
    .where('startAt', '>=', Timestamp.fromDate(lookBack))
    .where('startAt', '<', Timestamp.fromDate(end))
}

export async function findConflict(db: Firestore, start: Date, end: Date, tx?: Transaction) {
  const snap = await (tx ? tx.get(overlapQuery(db, start, end)) : overlapQuery(db, start, end).get())
  return snap.docs.find(d => d.get('endAt').toMillis() > start.getTime())
}
