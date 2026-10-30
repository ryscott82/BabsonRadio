import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { ms, namesFor } from './studio'
import { badgeActive, type Badge } from '../studioRules'

// Admin-side views of Studio training: the roster, and the recruiting list.

export type RosterStatus = 'active' | 'expiring' | 'expired' | 'revoked'
export interface RosterRow {
  grantId: string | null; legacy: boolean; uid: string; name: string; email: string; badge: Badge
  grantedAt: number | null; expiresAt: number | null; status: RosterStatus
  trainerUid: string; trainerName: string; sessionId: string; quizScore: number | null; grantedBy: string; reason: string
  revokedAt: number | null; revokedBy: string; revokeReason: string
}
export interface RosterFilter { q?: string; badge?: string; status?: string; trainer?: string; sessionId?: string; uid?: string }

const DAY = 86_400_000
const statusOf = (revokedAt: number | null, expiresAt: number | null, now: number): RosterStatus =>
  revokedAt != null ? 'revoked' : !badgeActive(expiresAt, now) ? 'expired' : expiresAt != null && expiresAt - now <= 30 * DAY ? 'expiring' : 'active'

/** Every grant, plus people trained through the old flow who have a badge but no grant yet (marked legacy). Filters are applied here. */
export async function buildRoster(db: Firestore, f: RosterFilter, now = Date.now()): Promise<RosterRow[]> {
  const [grants, studioUsers, radioUsers] = await Promise.all([
    f.uid ? db.collection('trainingGrants').where('uid', '==', f.uid).get() : db.collection('trainingGrants').orderBy('grantedAt', 'desc').limit(3000).get(),
    f.uid ? null : db.collection('users').where('studioTrained', '==', true).limit(1500).get(),
    f.uid ? null : db.collection('users').where('radioTrained', '==', true).limit(1500).get(),
  ])
  const raw = grants.docs.map(d => ({
    grantId: d.id, uid: String(d.get('uid')), badge: d.get('badge') as Badge, grantedAt: ms(d.get('grantedAt')), expiresAt: ms(d.get('expiresAt')),
    trainerUid: String(d.get('trainerUid') ?? ''), sessionId: String(d.get('sessionId') ?? ''), quizScore: (d.get('quizScore') ?? null) as number | null,
    grantedBy: String(d.get('grantedBy') ?? ''), reason: String(d.get('reason') ?? ''),
    revokedAt: ms(d.get('revokedAt')), revokedBy: String(d.get('revokedBy') ?? ''), revokeReason: String(d.get('revokeReason') ?? ''),
  }))
  const have = new Set(raw.filter(r => r.revokedAt == null).map(r => `${r.uid}:${r.badge}`))
  const legacy: typeof raw = []
  for (const [badge, snap] of [['studio', studioUsers], ['radio', radioUsers]] as const) {
    snap?.docs.forEach(d => {
      if (d.get('level') && d.get('level') !== 'student') return // directors and admins skip training
      if (have.has(`${d.id}:${badge}`)) return
      legacy.push({ grantId: null as unknown as string, uid: d.id, badge, grantedAt: null, expiresAt: ms(d.get(`${badge}ExpiresAt`)), trainerUid: '', sessionId: '', quizScore: null, grantedBy: 'old flow', reason: '', revokedAt: null, revokedBy: '', revokeReason: '' })
    })
  }
  const all = [...raw, ...legacy]
  const names = await namesFor(db, all.flatMap(r => [r.uid, r.trainerUid]))
  const q = (f.q ?? '').trim().toLowerCase()
  return all.map((r): RosterRow => ({
    ...r, legacy: r.grantId == null, name: names.get(r.uid)?.name ?? '', email: names.get(r.uid)?.email ?? '',
    trainerName: names.get(r.trainerUid)?.name ?? '', status: statusOf(r.revokedAt, r.expiresAt, now),
  })).filter(r =>
    (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) &&
    (!f.badge || r.badge === f.badge) && (!f.status || r.status === f.status) && (!f.trainer || r.trainerUid === f.trainer) && (!f.sessionId || r.sessionId === f.sessionId))
}

export const when = (v: number | null) => (v == null ? '' : new Date(v).toISOString())

export interface Recruit { uid: string; name: string; email: string; note: string; updatedAt: number | null }
export async function buildRecruits(db: Firestore): Promise<Recruit[]> {
  const snap = await db.collection('clubInterest').where('interested', '==', true).limit(2000).get()
  const names = await namesFor(db, snap.docs.map(d => d.id))
  return snap.docs.map(d => ({ uid: d.id, name: names.get(d.id)?.name ?? '', email: names.get(d.id)?.email ?? '', note: String(d.get('note') ?? ''), updatedAt: ms(d.get('updatedAt')) }))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}
