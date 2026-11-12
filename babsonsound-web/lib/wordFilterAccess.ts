// Who may change the blocked-words list: Admins can add and remove words and change how strict it is; Directors can only add words.
// Pure (no database), so the route and the tests share it.

/** The same clean-up the list always had: lowercase, trimmed, 2 to 40 letters, no repeats, at most 500 words. */
export const normalizeWords = (input: unknown): string[] =>
  [...new Set((Array.isArray(input) ? input : []).map(w => String(w).trim().toLowerCase().slice(0, 40)).filter(w => w.length >= 2))].slice(0, 500)

export type DirectorWordsPlan = { ok: true; words: string[]; added: string[] } | { ok: false; removed: string[] }

/** A Director's save against the list as it is saved right now: refused if any saved word is missing from it, otherwise the new list. */
export function directorWordsPlan(saved: string[], posted: unknown): DirectorWordsPlan {
  const next = normalizeWords(posted)
  const have = new Set(next)
  const removed = saved.filter(w => !have.has(w))
  if (removed.length) return { ok: false, removed }
  const was = new Set(saved)
  return { ok: true, words: next, added: next.filter(w => !was.has(w)) }
}

/** True when a posted strictness differs from the saved one (a Director may not change it; sending the same value is fine). */
export const levelChanges = (saved: string, posted: unknown) => posted !== undefined && posted !== saved
