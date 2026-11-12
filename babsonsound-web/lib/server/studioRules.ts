import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { DEFAULT_STUDIO, readStudioRules, type StudioRules } from '../studioBookCore'

// The studio booking and strike numbers an Admin can change in Admin > Settings, in config/studioRules (one small document), kept 20 s per server
// instance like the show-request rules. Until something is saved, the defaults in lib/studioBookCore.ts apply.
export const STUDIO_DOC = ['config', 'studioRules'] as const
let memo: { at: number; v: StudioRules } | null = null
export const resetStudioRules = () => { memo = null }

export async function loadStudioRules(db: Firestore = adminDb()): Promise<StudioRules> {
  if (memo && Date.now() - memo.at < 20_000) return memo.v
  let v = DEFAULT_STUDIO
  try { v = readStudioRules((await db.collection(STUDIO_DOC[0]).doc(STUDIO_DOC[1]).get()).data()) } catch { /* defaults */ }
  memo = { at: Date.now(), v }
  return v
}
