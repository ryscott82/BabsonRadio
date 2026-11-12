import { SCHOOL_DOMAINS } from './authDomains.ts'
import { GUEST_EMAIL, maskEmail } from './studioBookCore.ts'

// The guest list on the booking form and the Host a show form. No React, so the tests can run it.
// A chip is either a person picked from the suggestions (we only ever have their masked email; the server finds the real one from the id)
// or someone typed in (name and email). The whole email is never shown on a chip, only the masked one.

export interface GuestChip { key: string; name: string; id?: string; email?: string; masked: string; outside: boolean }
export interface Suggestion { id: string; name: string; emailMasked: string; kind: 'past' | 'member' }

export const isOutside = (email: string) => !SCHOOL_DOMAINS.some(d => email.toLowerCase().endsWith(d))

/** How many more people fit: the booker counts as one of the capacity. */
export const spotsLeft = (chips: GuestChip[], capacity: number) => Math.max(0, capacity - 1 - chips.length)

export function capacityLine(chips: GuestChip[], capacity: number): string {
  const left = spotsLeft(chips, capacity)
  return left === 0 ? `The studio is full at ${capacity} people, counting you.` : `${left} more ${left === 1 ? 'person fits' : 'people fit'} (${capacity} in the studio, counting you).`
}

const EMAIL_IN_TEXT = /([a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i
const titleCase = (s: string) => s.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase())

export type TypedResult = { ok: true; chip: GuestChip } | { ok: false; error: string }

/** "sam@x.edu", "Sam Lee sam@x.edu", "Sam Lee <sam@x.edu>" or "Sam Lee, sam@x.edu". A name alone is not enough (we need an email). */
export function parseTyped(text: string): TypedResult {
  const raw = text.trim()
  const m = raw.match(EMAIL_IN_TEXT)
  if (!m) return { ok: false, error: raw ? 'Pick a name from the list, or type a name and an email, like Sam Lee sam@babson.edu.' : '' }
  const email = m[1].toLowerCase()
  if (!GUEST_EMAIL.test(email) || email.length > 120) return { ok: false, error: 'That email does not look right.' }
  const name = raw.replace(m[1], '').replace(/[<>,;]/g, ' ').replace(/\s+/g, ' ').trim() || titleCase(email.split('@')[0])
  return { ok: true, chip: { key: `e:${email}`, name: name.slice(0, 60), email, masked: maskEmail(email), outside: isOutside(email) } }
}

export const chipFromSuggestion = (s: Suggestion): GuestChip => ({ key: `id:${s.id}`, name: s.name.slice(0, 60), id: s.id, masked: s.emailMasked, outside: false })

export type AddResult = { ok: true; chips: GuestChip[] } | { ok: false; error: string }

export function addChip(chips: GuestChip[], chip: GuestChip, capacity: number): AddResult {
  if (chips.some(c => c.key === chip.key)) return { ok: true, chips }
  if (spotsLeft(chips, capacity) <= 0) return { ok: false, error: `The studio is full at ${capacity} people, counting you.` }
  return { ok: true, chips: [...chips, chip] }
}

export const removeChip = (chips: GuestChip[], key: string) => chips.filter(c => c.key !== key)

/** What the server wants: picked people by id, typed people by name and email. */
export const toPayload = (chips: GuestChip[]) => chips.map(c => (c.id ? { id: c.id, name: c.name, email: '' } : { name: c.name, email: c.email ?? '' }))

/** Needed unless "just me" is ticked. Returns the sentence to show, or ''. */
export function guestsProblem(chips: GuestChip[], justMe: boolean): string {
  if (justMe && chips.length) return 'Choose "Just me" or list who is coming, not both.'
  if (!justMe && !chips.length) return 'Add who is coming with you, or tick "Just me".'
  return ''
}

/** The label under a chip. Never a whole email. */
export const chipLabel = (c: GuestChip) => `${c.masked}${c.outside ? ' · outside email' : ''}`
