import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'

// ── Shows ──────────────────────────────────────────────────────

export async function getShows() {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('isActive', '==', true), orderBy('name'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getShowBySlug(slug: string) {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('slug', '==', slug), limit(1))
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

export async function getFeaturedShows() {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('isFeatured', '==', true), where('isActive', '==', true))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Episodes ───────────────────────────────────────────────────

export async function getRecentEpisodes(count = 10) {
  const snap = await getDocs(
    query(collection(db, 'episodes'), orderBy('publishedAt', 'desc'), limit(count))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getEpisodesByShow(showId: string) {
  const snap = await getDocs(
    query(
      collection(db, 'episodes'),
      where('showId', '==', showId),
      orderBy('publishedAt', 'desc')
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getFeaturedEpisodes() {
  const snap = await getDocs(
    query(collection(db, 'episodes'), where('isFeatured', '==', true), orderBy('publishedAt', 'desc'), limit(6))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Schedule ───────────────────────────────────────────────────

export async function getSchedule() {
  const snap = await getDocs(
    query(collection(db, 'schedule'), where('isActive', '==', true), orderBy('dayOfWeek'), orderBy('startTime'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getTodaySchedule() {
  const today = new Date().getDay() // 0=Sun
  const snap = await getDocs(
    query(
      collection(db, 'schedule'),
      where('isActive', '==', true),
      where('dayOfWeek', '==', today),
      orderBy('startTime')
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Presence / listener count ──────────────────────────────────

export function subscribeToListenerCount(callback: (count: number) => void) {
  return onSnapshot(
    query(collection(db, 'presence'), where('isListening', '==', true)),
    (snap: QuerySnapshot<DocumentData>) => callback(snap.size)
  )
}
