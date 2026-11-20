// Set lists belong to the show entries on the schedule page. Pure, so the tests can cover the matching and the CSV.
export interface SetListItem { id: string; showTitle: string; startAt: number; songs: string; songCount: number }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** The set lists a host entered for this show (matched by name, ignoring case and spacing), newest first. */
export const setlistsFor = (items: SetListItem[], name: string) =>
  items.filter(i => norm(i.showTitle) === norm(name) && norm(name) !== '').sort((a, b) => b.startAt - a.startAt)

/** Set lists that match none of the given show or event names (a renamed or removed show), so none are lost from view. */
export const unmatchedSetlists = (items: SetListItem[], names: string[]) => {
  const known = new Set(names.map(norm).filter(Boolean))
  return items.filter(i => !known.has(norm(i.showTitle)))
}

/** One row per song, like the old Set lists page's file. */
export function setlistsCsv(items: SetListItem[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const rows = [['Show', 'Aired', 'Song'].map(esc).join(',')]
  for (const i of items) {
    for (const line of i.songs.split('\n').map(l => l.trim()).filter(Boolean)) {
      rows.push([i.showTitle, new Date(i.startAt).toLocaleString('en-US', { timeZone: 'America/New_York' }), line].map(esc).join(','))
    }
  }
  return rows.join('\n')
}
