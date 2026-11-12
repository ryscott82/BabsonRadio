import 'server-only'
import { Timestamp, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore'
import { SLOT_RULES } from '../slots'
import { deleteImage } from './images'

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

/**
 * Deletes a request's picture, unless another pending or approved request (a repeat of the same show) still uses the same file.
 * `exceptId` is the request that is going away.
 */
export async function releaseImage(db: Firestore, imagePath: unknown, exceptId: string) {
  const path = typeof imagePath === 'string' ? imagePath : ''
  if (!path) return
  const others = await db.collection('slotRequests').where('imagePath', '==', path).get()
  if (others.docs.some(d => d.id !== exceptId && (d.get('status') === 'pending' || d.get('status') === 'approved'))) return
  await deleteImage(path)
}
