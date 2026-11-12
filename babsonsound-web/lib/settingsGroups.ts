import { isChanged, type SettingDef, type SettingValue } from './settingRow.ts'

// How a page shows the settings it controls: the few that matter as cards (visible: 'main'), the rest in one closed Expert fold, a one-line status
// ("Everything is on the recommended settings." / "N changed from recommended") with Reset all, and the Listening page's guest switch.
// Pure (no React, no fetch), so the tests cover it.

export interface Row { def: SettingDef; value: SettingValue; changedAt: number | null; changedBy: string | null }

export const splitRows = (rows: Row[]) => ({
  main: rows.filter(r => r.def.visible === 'main'),
  expert: rows.filter(r => r.def.visible !== 'main'),
})

export const changedRows = (rows: Row[]) => rows.filter(r => isChanged(r.def, r.value))

/** The line at the top of a page. */
export const statusLine = (n: number) => (n === 0 ? 'Everything is on the recommended settings.' : `${n} changed from recommended`)

/** Reset all: null (= the recommended value) for each CHANGED key and nothing else, in one PATCH. */
export const resetAllBody = (rows: Row[]) => ({ changes: Object.fromEntries(changedRows(rows).map(r => [r.def.id, null])) as Record<string, null> })

/** What the Reset all confirm names: how many, and who feels it. */
export function resetAllText(rows: Row[]): { title: string; body: string } {
  const ch = changedRows(rows)
  const who = [...new Set(ch.map(r => r.def.affects).filter((x): x is string => !!x))]
  return {
    title: `Reset ${ch.length} setting${ch.length === 1 ? '' : 's'} to recommended?`,
    body: `${who.length ? `This affects ${who.join('; ')}. ` : ''}Each one goes back to its recommended value: ${ch.map(r => r.def.label).join('; ')}.`,
  }
}

// ── Listening: students and guests share one set of values unless the switch is on ──
export const GUEST_SHARED = ['idleMin', 'sessionMaxMin', 'quietEnabled', 'quietStart', 'quietEnd'] as const
export const studentKey = (k: string) => `limits.student.${k}`
export const guestKey = (k: string) => `limits.guest.${k}`
const partOf = (key: string): { who: 'student' | 'guest'; name: string } | null => {
  const m = /^limits\.(student|guest)\.(\w+)$/.exec(key)
  return m && (GUEST_SHARED as readonly string[]).includes(m[2]) ? { who: m[1] as 'student' | 'guest', name: m[2] } : null
}

/** The switch starts ON when students and guests already differ, so nothing is hidden. */
export function guestsDiffer(get: (key: string) => SettingValue | undefined): boolean {
  return GUEST_SHARED.some(k => get(studentKey(k)) !== undefined && get(guestKey(k)) !== undefined && get(studentKey(k)) !== get(guestKey(k)))
}

/**
 * The PATCH `changes` for saving (or resetting, value null) one setting. With the guest switch OFF a student value is written to both the student and
 * the guest key, so the two never drift apart. With it ON, or for any other key, only that key is written.
 */
export function listeningChanges(key: string, value: SettingValue | null, separateGuests: boolean): Record<string, SettingValue | null> {
  const p = partOf(key)
  if (!p || separateGuests || p.who === 'guest') return { [key]: value }
  return { [studentKey(p.name)]: value, [guestKey(p.name)]: value }
}

/** Turning the switch OFF while guests differ: guests take the student values (one PATCH). */
export function guestsFollowStudents(get: (key: string) => SettingValue | undefined): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {}
  for (const k of GUEST_SHARED) { const v = get(studentKey(k)); if (v !== undefined && v !== get(guestKey(k))) out[guestKey(k)] = v }
  return out
}
