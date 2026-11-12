import { badgeActive } from './studioRules.ts'

// What staff see about one person (E-board and Admin): name, role, training, and their show requests. Never an email, a phone number or an Instagram handle.
export interface ProfileUser { firstName?: string; displayName?: string; lastName?: string; gradYear?: string; level?: string; radioTrained?: boolean; radioExpiresAt?: number | null; studioTrained?: boolean; studioExpiresAt?: number | null }
export interface ProfileSlot { id: string; title: string; startAt: number; type: string; status: string }
export interface Training { trained: boolean; expired: boolean; until: number | null }

/** Trained now, or trained once but the badge has ended (badges end each June 30). */
export function trainingOf(flag: boolean | undefined, expiresAt: number | null | undefined, now: number): Training {
  if (flag !== true) return { trained: false, expired: false, until: null }
  const live = badgeActive(expiresAt ?? null, now)
  return { trained: live, expired: !live, until: expiresAt ?? null }
}

export function shapeProfile(u: ProfileUser, slots: ProfileSlot[], now: number) {
  const level = u.level === 'admin' || u.level === 'director' || u.level === 'student' ? u.level : 'guest'
  const shows = [...slots].sort((a, b) => b.startAt - a.startAt).slice(0, 50).map(s => ({ id: s.id, title: s.title, startAt: s.startAt, type: s.type, status: s.status }))
  return {
    name: [u.firstName ?? u.displayName ?? '', u.lastName ?? ''].join(' ').trim() || 'Unknown',
    gradYear: u.gradYear ?? '', level,
    radio: level === 'director' || level === 'admin' ? { trained: true, expired: false, until: null } : trainingOf(u.radioTrained, u.radioExpiresAt, now),
    studio: trainingOf(u.studioTrained, u.studioExpiresAt, now),
    shows,
    counts: { total: slots.length, approved: slots.filter(s => s.status === 'approved').length, declined: slots.filter(s => s.status === 'declined').length, pending: slots.filter(s => s.status === 'pending').length },
  }
}
