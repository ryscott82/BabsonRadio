import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { localParts } from '../autoschedule'
import { loadConfig } from './autoschedule'

// Optional birthdays (month and day only, never the year). They are used for two things only:
// a happy-birthday notification to the person, and telling the DJ when it is someone's birthday.

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export interface Birthday { month: number; day: number }

export function cleanBirthday(v: unknown): Birthday | null {
  const o = (v ?? {}) as Record<string, unknown>
  const month = Number(o.month), day = Number(o.day)
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > DAYS[month - 1]) return null
  return { month, day }
}

export interface PersonBirthday { uid: string; name: string; month: number; day: number; role?: string }

/** "Ryan S." — first name and last initial, so a DJ can say it on air without exposing more. */
const shortName = (first: string, last: string) => (first || 'Listener') + (last ? ` ${last.trim()[0]?.toUpperCase()}.` : '')

/** Everyone whose birthday is today, in station time. */
export async function birthdaysToday(db: Firestore, now = Date.now()): Promise<PersonBirthday[]> {
  const tz = (await loadConfig(db)).timezone
  const p = localParts(now, tz)
  const snap = await db.collection('users').where('birthday.month', '==', p.m).where('birthday.day', '==', p.d).get()
  return snap.docs.map(d => ({
    uid: d.id, name: shortName(String(d.get('firstName') ?? d.get('displayName') ?? ''), String(d.get('lastName') ?? '')),
    month: p.m, day: p.d, role: d.get('accountType'),
  }))
}

/** The master list for Admin: everyone who shared a birthday, soonest upcoming first. */
export async function allBirthdays(db: Firestore, now = Date.now()): Promise<(PersonBirthday & { daysAway: number })[]> {
  const tz = (await loadConfig(db)).timezone
  const p = localParts(now, tz)
  const today = Date.UTC(2001, p.m - 1, p.d) // 2001 is not a leap year; Feb 29 counts as Mar 1 for ordering
  const snap = await db.collection('users').where('birthday.month', '>', 0).get()
  return snap.docs.map(d => {
    const m = Number(d.get('birthday.month')), day = Number(d.get('birthday.day'))
    let t = Date.UTC(2001, m - 1, Math.min(day, new Date(Date.UTC(2001, m, 0)).getUTCDate()))
    if (t < today) t = Date.UTC(2002, m - 1, Math.min(day, new Date(Date.UTC(2002, m, 0)).getUTCDate()))
    return {
      uid: d.id, month: m, day,
      name: [d.get('firstName') ?? d.get('displayName') ?? '', d.get('lastName') ?? ''].join(' ').trim() || '(no name)',
      role: d.get('accountType'), daysAway: Math.round((t - today) / 86_400_000),
    }
  }).sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name))
}
