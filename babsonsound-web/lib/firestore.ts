import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'

/** A Firestore document with its id. Fields are loosely typed on purpose; the pages read the ones they need. */
export type Doc = { id: string } & DocumentData
const toDoc = (d: QueryDocumentSnapshot): Doc => ({ id: d.id, ...d.data() })

// ── Shows ──────────────────────────────────────────────────────

async function _getShows() {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('isActive', '==', true), orderBy('name'))
  )
  return snap.docs.map(toDoc)
}

async function _getShowBySlug(slug: string) {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('slug', '==', slug), limit(1))
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return toDoc(d)
}

async function _getFeaturedShows() {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('isFeatured', '==', true), where('isActive', '==', true))
  )
  return snap.docs.map(toDoc)
}

// ── Episodes ───────────────────────────────────────────────────

async function _getRecentEpisodes(count = 10) {
  const snap = await getDocs(
    query(collection(db, 'episodes'), where('visibility', '==', 'public'), orderBy('publishedAt', 'desc'), limit(count))
  )
  return snap.docs.map(toDoc)
}

async function _getEpisodesByShow(showId: string) {
  const snap = await getDocs(
    query(
      collection(db, 'episodes'),
      where('showId', '==', showId),
      where('visibility', '==', 'public'),
      orderBy('publishedAt', 'desc')
    )
  )
  return snap.docs.map(toDoc)
}

async function _getFeaturedEpisodes() {
  const snap = await getDocs(
    query(collection(db, 'episodes'), where('isFeatured', '==', true), where('visibility', '==', 'public'), orderBy('publishedAt', 'desc'), limit(6))
  )
  return snap.docs.map(toDoc)
}

// ── Schedule ───────────────────────────────────────────────────

async function _getSchedule() {
  const snap = await getDocs(
    query(collection(db, 'schedule'), where('isActive', '==', true), orderBy('dayOfWeek'), orderBy('startTime'))
  )
  return snap.docs.map(toDoc)
}

async function _getTodaySchedule() {
  const today = new Date().getDay() // 0=Sun
  const snap = await getDocs(
    query(
      collection(db, 'schedule'),
      where('isActive', '==', true),
      where('dayOfWeek', '==', today),
      orderBy('startTime')
    )
  )
  return snap.docs.map(toDoc)
}

// ── Fail-soft wrappers ─────────────────────────────────────────
// Pages are pre-rendered at build time. A missing index or a rules denial should show an empty
// section, never break the whole deploy. These pages are public, so episode queries ask for
// visibility == 'public' only (the rules reject any query that could also return private ones).

async function soft<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.error(`[firestore] ${label} failed:`, e instanceof Error ? e.message : e)
    return fallback
  }
}

export const getShows            = () => soft(_getShows, [], 'getShows')
export const getShowBySlug       = (slug: string) => soft(() => _getShowBySlug(slug), null, 'getShowBySlug')
export const getFeaturedShows    = () => soft(_getFeaturedShows, [], 'getFeaturedShows')
export const getRecentEpisodes   = (count = 10) => soft(() => _getRecentEpisodes(count), [], 'getRecentEpisodes')
export const getEpisodesByShow   = (showId: string) => soft(() => _getEpisodesByShow(showId), [], 'getEpisodesByShow')
export const getFeaturedEpisodes = () => soft(_getFeaturedEpisodes, [], 'getFeaturedEpisodes')
export const getSchedule         = () => soft(_getSchedule, [], 'getSchedule')
export const getTodaySchedule    = () => soft(_getTodaySchedule, [], 'getTodaySchedule')
