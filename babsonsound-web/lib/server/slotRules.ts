import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { DEFAULT_AUTO_RULES, type AutoRules } from '../slotAuto'
import { SLOT_SETTING_KEYS, readSlotRules } from '../slotRulesCore'

// The show-request numbers Admins can change in Admin > Settings, stored in config/slotRules (one small document). Until something is saved,
// the defaults in lib/slotAuto.ts apply. Read by the request, repeat, options and approval code, kept 20 s per server instance like the Auto DJ config.
export const SLOT_RULES_DOC = ['config', 'slotRules'] as const
let memo: { at: number; v: AutoRules } | null = null
export const resetSlotRules = () => { memo = null }

export async function loadSlotRules(db: Firestore = adminDb()): Promise<AutoRules> {
  if (memo && Date.now() - memo.at < 20_000) return memo.v
  let v = DEFAULT_AUTO_RULES
  try { v = readSlotRules((await db.collection(SLOT_RULES_DOC[0]).doc(SLOT_RULES_DOC[1]).get()).data()) } catch { /* defaults */ }
  memo = { at: Date.now(), v }
  return v
}
export { SLOT_SETTING_KEYS }
