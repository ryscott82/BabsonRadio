// The Blocked words page. Directors can add words but not remove them or change how strict the filter is; Admins keep full control.
// The server checks again (addBlockedWords): a Director's request must contain every saved word and no level.

export type Level = 'crude' | 'explicit'

/** Words typed into a box: one per line or separated by commas, trimmed, lowercase, no blanks, no repeats. */
export function parseWords(text: string): string[] {
  const seen = new Set<string>()
  for (const w of text.split(/[\n,]/)) { const t = w.trim().toLowerCase(); if (t) seen.add(t) }
  return [...seen]
}

/** What a Director sends: the saved words plus the new ones. No level. */
export function directorBody(saved: string[], typed: string): { words: string[] } {
  return { words: [...new Set([...saved.map(w => w.toLowerCase()), ...parseWords(typed)])] }
}

/** What an Admin sends: the whole list as edited, and the strictness. */
export function adminBody(text: string, level: Level): { words: string[]; level: Level } {
  return { words: parseWords(text), level }
}

/** How many of the typed words are new (so the page can say "Added 2"). */
export const newWordCount = (saved: string[], typed: string) => parseWords(typed).filter(w => !saved.map(s => s.toLowerCase()).includes(w)).length

/** Only an Admin gets the remove buttons and the strictness control (they are not rendered for a Director). */
export const canEditList = (admin: boolean) => admin
