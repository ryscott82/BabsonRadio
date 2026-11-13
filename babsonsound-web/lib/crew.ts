// The studio crew: the person signed in on the studio PC is the driver; anyone else who scans the door code while the booth is in use joins
// the crew (credited on the show, attendance logged) and can take over when the driver agrees on the PC. Pure rules, shared with the tests.

export const CREW_MAX = 8
/** The booth page checks in every 4 minutes; no check-in for this long and the crew is forgotten (the PC closed without signing out). */
export const CREW_FRESH_MS = 10 * 60_000

export interface CrewPerson { uid: string; name: string; firstName: string; joinedAt: number }
export interface CrewDoc { driverUid: string; driverName: string; sessionId: string; updatedAt: number; members: Record<string, CrewPerson> }

export const crewFresh = (d: CrewDoc | null | undefined, now: number): d is CrewDoc => !!d && d.updatedAt > now - CREW_FRESH_MS

export const crewList = (d: CrewDoc | null | undefined): CrewPerson[] =>
  Object.values(d?.members ?? {}).sort((a, b) => a.joinedAt - b.joinedAt)

/** Someone scanned while the booth is in use. The driver and people already in the crew change nothing. */
export function addCrew(d: CrewDoc, p: Omit<CrewPerson, 'joinedAt'>, now: number): { doc: CrewDoc; added: boolean; full: boolean } {
  if (p.uid === d.driverUid || d.members[p.uid]) return { doc: d, added: false, full: false }
  if (Object.keys(d.members).length >= CREW_MAX) return { doc: d, added: false, full: true }
  return { doc: { ...d, updatedAt: now, members: { ...d.members, [p.uid]: { ...p, joinedAt: now } } }, added: true, full: false }
}

/** A crew member takes over: they become the driver and the old driver joins the crew. null if they are not in the crew. */
export function handOff(d: CrewDoc, newUid: string, oldFirstName: string, now: number): { doc: CrewDoc; newDriver: CrewPerson } | null {
  const nd = d.members[newUid]
  if (!nd) return null
  const members = { ...d.members }
  delete members[newUid]
  members[d.driverUid] = { uid: d.driverUid, name: d.driverName, firstName: oldFirstName, joinedAt: now }
  return { doc: { driverUid: nd.uid, driverName: nd.name, sessionId: '', updatedAt: now, members }, newDriver: nd }
}

/** Names for the show's host list: the existing hosts, the driver if the list was empty, then the newcomer. No repeats. */
export function hostsWith(existing: string[], driverName: string, add: string): string[] {
  const out: string[] = []
  for (const n of [...(existing.length ? existing : [driverName]), add]) {
    const t = n.trim()
    if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out.slice(0, 12)
}
