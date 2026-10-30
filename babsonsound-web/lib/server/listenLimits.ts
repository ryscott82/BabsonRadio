import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { DEFAULT_AUDIENCE, DEFAULT_LIMITS, audienceErrors, cleanAudience, type Limits } from '../listenLimits'

// Listening limits for students and guests: usage/limits (set in Admin > Listening limits). Until something is saved there, the old overnight quiet
// hours in usage/config carry over to both, so nothing changes by itself.
const REF = (db: Firestore) => db.collection('usage').doc('limits')
let memo: { at: number; v: Limits } | null = null

export async function loadLimits(db: Firestore = adminDb()): Promise<Limits> {
  if (memo && Date.now() - memo.at < 30_000) return memo.v
  let v = DEFAULT_LIMITS
  try {
    const [s, c] = await Promise.all([REF(db).get(), db.collection('usage').doc('config').get()])
    const old = c.data() ?? {}
    const base = cleanAudience({ quietEnabled: old.quietEnabled, quietStart: old.quietStart, quietEnd: old.quietEnd }, DEFAULT_AUDIENCE)
    v = { budgetEnabled: s.get('budgetEnabled') === true, student: cleanAudience(s.get('student'), base), guest: cleanAudience(s.get('guest'), base) }
  } catch { /* defaults */ }
  memo = { at: Date.now(), v }
  return v
}

export async function saveLimits(input: { budgetEnabled?: unknown; student?: unknown; guest?: unknown }, uid: string): Promise<Limits> {
  const bad = [...audienceErrors(input.student).map(k => `student ${k}`), ...audienceErrors(input.guest).map(k => `guest ${k}`)]
  if (bad.length) throw new Error(`Out of range: ${bad.join(', ')}.`)
  const db = adminDb()
  const cur = await loadLimits(db)
  const next: Limits = {
    budgetEnabled: typeof input.budgetEnabled === 'boolean' ? input.budgetEnabled : cur.budgetEnabled,
    student: cleanAudience(input.student, cur.student), guest: cleanAudience(input.guest, cur.guest),
  }
  await REF(db).set({ ...next, updatedAt: Date.now(), updatedBy: uid })
  memo = null
  return next
}

export async function limitsInfo() {
  const db = adminDb()
  const [limits, s] = await Promise.all([loadLimits(db), REF(db).get().catch(() => null)])
  return { limits, updatedAt: (s?.get('updatedAt') as number | undefined) ?? null }
}
