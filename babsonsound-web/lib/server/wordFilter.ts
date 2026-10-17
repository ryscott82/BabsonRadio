import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { HttpError } from './http'

// Words that may not go out to listeners or staff in a host's message. A short starter list lives here; staff add more in
// Admin > Blocked words (saved in config/blockedWords). Matching ignores case, spacing tricks and common look-alike characters.
const STARTER = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'pussy', 'whore', 'slut']

const SWAP: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' }
const squash = (s: string) => s.toLowerCase().replace(/[01345 7@$!]/g, c => SWAP[c] ?? c).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1')

let cache: { at: number; words: string[] } | null = null

export async function loadBlocked(db: Firestore): Promise<string[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.words
  const d = await db.collection('config').doc('blockedWords').get()
  const extra = Array.isArray(d.get('words')) ? (d.get('words') as unknown[]).map(w => String(w).trim().toLowerCase()).filter(Boolean) : []
  const words = [...new Set([...STARTER, ...extra])]
  cache = { at: Date.now(), words }
  return words
}

export async function saveBlocked(db: Firestore, input: unknown, uid: string): Promise<string[]> {
  const words = [...new Set((Array.isArray(input) ? input : []).map(w => String(w).trim().toLowerCase().slice(0, 40)).filter(w => w.length >= 2))].slice(0, 500)
  await db.collection('config').doc('blockedWords').set({ words, updatedBy: uid, updatedAt: new Date() })
  cache = null
  return words
}

/** Throws a friendly error if the text has a blocked word. Whole words are matched for short ones, anywhere inside for long ones. */
export async function assertClean(db: Firestore, ...texts: string[]): Promise<void> {
  const words = await loadBlocked(db)
  for (const text of texts) {
    if (!text) continue
    const tokens = text.toLowerCase().split(/[^a-z0-9@$!]+/).map(squash).filter(Boolean)
    const joined = squash(text)
    for (const w of words) {
      const sw = squash(w)
      if (!sw) continue
      if (tokens.includes(sw) || (sw.length >= 5 && joined.includes(sw))) {
        throw new HttpError(400, 'That message has a word we do not allow on air. Reword it and try again.', 'BR-HST-004')
      }
    }
  }
}
