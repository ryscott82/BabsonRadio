import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from './firebase'

// ── Shows ──────────────────────────────────────────────────────

async function _getShows() {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('isActive', '==', true), orderBy('name'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

async function _getShowBySlug(slug: string) {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('slug', '==', slug), limit(1))
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

async function _getFeaturedShows() {
  const snap = await getDocs(
    query(collection(db, 'shows'), where('isFeatured', '==', true), where('isActive', '==', true))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Episodes ───────────────────────────────────────────────────

async function _getRecentEpisodes(count = 10) {
  const snap = await getDocs(
    query(collection(db, 'episodes'), orderBy('publishedAt', 'desc'), limit(count))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

async function _getEpisodesByShow(showId: string) {
  const snap = await getDocs(
    query(
      collection(db, 'episodes'),
      where('showId', '==', showId),
      orderBy('publishedAt', 'desc')
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

async function _getFeaturedEpisodes() {
  const snap = await getDocs(
    query(collection(db, 'episodes'), where('isFeatured', '==', true), orderBy('publishedAt', 'desc'), limit(6))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Schedule ───────────────────────────────────────────────────

async function _getSchedule() {
  const snap = await getDocs(
    query(collection(db, 'schedule'), where('isActive', '==', true), orderBy('dayOfWeek'), orderBy('startTime'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Fail-soft wrappers ─────────────────────────────────────────
// Pages are pre-rendered at build time. A missing index or a rules denial should show an empty
// section, never break the whole deploy. (Episodes are private to students, so an anonymous
// server render may legitimately get nothing back.)

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
