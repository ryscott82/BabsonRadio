import 'server-only'
import { getApps } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './admin'

// Push notifications to admins' phones (through Firebase Cloud Messaging, which is free).
// A phone registers once from the Admin screen in the app. Each device chooses which kinds it wants.

export const PUSH_KINDS = ['reports', 'requests', 'cancellations', 'ops', 'birthday', 'announcements'] as const
export type PushKind = (typeof PUSH_KINDS)[number]

/** Kinds each person chooses for themselves from their own profile (everyone, not just admins). */
export const USER_KINDS: PushKind[] = ['birthday', 'announcements']

export const cleanKinds = (v: unknown): PushKind[] =>
  (Array.isArray(v) ? v : []).filter((x): x is PushKind => (PUSH_KINDS as readonly string[]).includes(String(x)))

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Tell admins something happened. Never throws: a failed push must not break the action that caused it. */
export async function notifyAdmins(kind: PushKind, msg: { title: string; body: string }, exceptUid = ''): Promise<void> {
  try {
    const db = adminDb()
    const snap = await db.collection('deviceTokens').where('kinds', 'array-contains', kind).get()
    const docs = snap.docs.filter(d => d.get('uid') !== exceptUid)
    if (!docs.length) return

    // Only people who are still admins get them.
    const uids = [...new Set(docs.map(d => String(d.get('uid'))))]
    const users = await db.getAll(...uids.map(u => db.collection('users').doc(u)))
    const staff = new Set(users.filter(u => u.get('level') === 'admin' || u.get('role') === 'superAdmin').map(u => u.id))
    const keep = docs.filter(d => staff.has(String(d.get('uid'))))
    const gone = docs.filter(d => !keep.includes(d))
    await Promise.all(gone.map(d => d.ref.delete()))
    if (!keep.length || !getApps().length) return

    const res = await getMessaging(getApps()[0]).sendEachForMulticast({
      tokens: keep.map(d => d.id),
      notification: { title: clip(msg.title, 60), body: clip(msg.body, 160) },
      data: { kind },
      apns: { payload: { aps: { sound: 'default' } } },
    })
    // Drop tokens the phone no longer accepts (app deleted, notifications turned off).
    const dead = res.responses.flatMap((r, i) =>
      !r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code ?? '') ? [keep[i]] : [])
    await Promise.all(dead.map(d => d.ref.delete()))
  } catch (e) {
    console.error('[push]', e)
  }
}

/** Station announcements (live events and the like) to every phone that turned them on. Returns how many were delivered. */
export async function notifyAnnouncements(msg: { title: string; body: string }): Promise<number> {
  try {
    if (!getApps().length) return 0
    const snap = await adminDb().collection('deviceTokens').where('kinds', 'array-contains', 'announcements').get()
    let ok = 0
    for (let i = 0; i < snap.docs.length; i += 500) { // FCM takes up to 500 devices per call
      const docs = snap.docs.slice(i, i + 500)
      const res = await getMessaging(getApps()[0]).sendEachForMulticast({
        tokens: docs.map(d => d.id),
        notification: { title: clip(msg.title, 60), body: clip(msg.body, 160) },
        data: { kind: 'announcements' },
        apns: { payload: { aps: { sound: 'default' } } },
      })
      ok += res.successCount
      const dead = res.responses.flatMap((r, j) =>
        !r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code ?? '') ? [docs[j]] : [])
      await Promise.all(dead.map(d => d.ref.delete()))
    }
    return ok
  } catch (e) {
    console.error('[push]', e)
    return 0
  }
}

/** Send one message to specific people's phones, only to devices that turned this kind on. Never throws. */
export async function notifyUsers(kind: PushKind, uids: string[], msg: { title: string; body: string }): Promise<number> {
  try {
    if (!uids.length || !getApps().length) return 0
    const want = new Set(uids)
    const snap = await adminDb().collection('deviceTokens').where('kinds', 'array-contains', kind).get()
    const docs = snap.docs.filter(d => want.has(String(d.get('uid'))))
    if (!docs.length) return 0
    const res = await getMessaging(getApps()[0]).sendEachForMulticast({
      tokens: docs.map(d => d.id),
      notification: { title: clip(msg.title, 60), body: clip(msg.body, 160) },
      data: { kind },
      apns: { payload: { aps: { sound: 'default' } } },
    })
    const dead = res.responses.flatMap((r, i) =>
      !r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code ?? '') ? [docs[i]] : [])
    await Promise.all(dead.map(d => d.ref.delete()))
    return res.successCount
  } catch (e) {
    console.error('[push]', e)
    return 0
  }
}

export async function saveDevice(uid: string, token: string, kinds: PushKind[], dev: boolean) {
  const ref = adminDb().collection('deviceTokens').doc(token)
  if (!kinds.length) { await ref.delete(); return }
  await ref.set({ uid, kinds, dev, platform: 'ios', updatedAt: Timestamp.now() })
}
