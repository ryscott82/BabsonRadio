import 'server-only'
import { createHash } from 'node:crypto'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { adminAuth } from './admin'
import { HttpError } from './http'
import { SITE_URL } from '../links'
import { unsubscribeToken } from '../launchLock'
import { LAUNCH_EMAIL_HTML, LAUNCH_EMAIL_SUBJECT, LAUNCH_EMAIL_TEXT } from './launchEmailCopy'

// The one launch email, sent from /admin/launch-email through POST /api/admin/launch-email.
//
// State (server-only collections, deny all client access in firestore.rules):
//   launchEmail/{sha256(email)}   one doc per address: status sending | sent | failed, sentAt, error. The doc id is
//                                 the lowercased address, so a person is never emailed twice, even with two accounts.
//   launchEmail/_run              the list being worked through, and how far we got (so each call is one small chunk).
//   launchEmailFailures/{auto}    every failure: address, reason, time.
//
// Safe to repeat: an address is claimed (status "sending") before it is mailed, "sent" is written right after, and Resend
// is given an Idempotency-Key, so a double click, a retry or a crash can not send it twice.

const CHUNK = 25                 // people per call; about 15 s at Resend's 2-requests-a-second limit
const GAP_MS = 520               // between Resend requests
const BUDGET_MS = 45_000         // stop a chunk early rather than hit the function time limit
const STALE_CLAIM_MS = 5 * 60_000

export const keyOf = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function launchMailConfigured() { return !!process.env.RESEND_API_KEY }

interface Acct { uid: string; email: string; verified: boolean }

/** Every account that has an email, deduped by lowercased address. Auth reads cost no Firestore reads. */
async function accounts(): Promise<Acct[]> {
  const out = new Map<string, Acct>()
  let token: string | undefined
  do {
    const page = await adminAuth().listUsers(1000, token)
    for (const u of page.users) {
      const email = (u.email ?? '').trim().toLowerCase()
      if (!email || u.disabled) continue
      const prev = out.get(email)
      if (!prev || (!prev.verified && u.emailVerified)) out.set(email, { uid: u.uid, email, verified: u.emailVerified })
    }
    token = page.pageToken
  } while (token)
  return [...out.values()]
}

async function optedOut(db: Firestore): Promise<{ uids: Set<string>; emails: Set<string> }> {
  const snap = await db.collection('users').where('emailOptOut', '==', true).get()
  return { uids: new Set(snap.docs.map(d => d.id)), emails: new Set(snap.docs.map(d => String(d.get('email') ?? '').toLowerCase()).filter(Boolean)) }
}

async function sentSet(db: Firestore, emails: string[]): Promise<Set<string>> {
  const sent = new Set<string>()
  for (let i = 0; i < emails.length; i += 300) {
    const refs = emails.slice(i, i + 300).map(e => db.collection('launchEmail').doc(keyOf(e)))
    const docs = await db.getAll(...refs, { fieldMask: ['status'] })
    docs.forEach((d, j) => { if (d.get('status') === 'sent') sent.add(emails[i + j]) })
  }
  return sent
}

const school = (email: string) => {
  const d = email.slice(email.indexOf('@') + 1)
  return d === 'babson.edu' ? 'babson' : d === 'olin.edu' ? 'olin' : d === 'wellesley.edu' ? 'wellesley' : 'other'
}

export async function preview(db: Firestore) {
  const [all, out, sentCount] = await Promise.all([
    accounts(), optedOut(db),
    db.collection('launchEmail').where('status', '==', 'sent').count().get(),
  ])
  const bySchool = { babson: 0, olin: 0, wellesley: 0, other: 0 }
  for (const a of all) bySchool[school(a.email)]++
  const verified = all.filter(a => a.verified)
  return {
    total: all.length,
    verified: verified.length,
    unverified: all.length - verified.length,
    optedOut: out.uids.size,
    alreadySent: sentCount.data().count,
    // extras for the admin page
    bySchool,
    /** verified and not unsubscribed (before taking away the ones already sent) */
    eligible: verified.filter(a => !out.uids.has(a.uid) && !out.emails.has(a.email)).length,
  }
}

// ── sending ──
async function unsubUrls(uid: string) {
  const token = await unsubscribeToken(uid)
  if (!token) throw new HttpError(503, 'Unsubscribe links are not set up (LAUNCH_SECRET).', 'BR-LCH-001')
  return { page: `${SITE_URL}/unsubscribe?t=${encodeURIComponent(token)}`, api: `${SITE_URL}/api/unsubscribe?t=${encodeURIComponent(token)}` }
}

type SendResult = { ok: true; id: string } | { ok: false; reason: string; retryAfterS?: number }

async function resend(to: string, uid: string, idemKey: string, prefix = ''): Promise<SendResult> {
  const u = await unsubUrls(uid)
  const from = process.env.MAIL_FROM || 'Babson Radio <hello@babsonradio.com>'
  const replyTo = process.env.MAIL_REPLY_TO || (from.match(/<([^>]+)>/)?.[1] ?? from)
  const body = {
    from, to: [to], reply_to: replyTo,
    subject: prefix + LAUNCH_EMAIL_SUBJECT,
    text: LAUNCH_EMAIL_TEXT.replaceAll('{{UNSUB}}', u.page),
    html: LAUNCH_EMAIL_HTML.replaceAll('{{UNSUB}}', u.page),
    headers: { 'List-Unsubscribe': `<${u.api}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return { ok: true, id: String(((await res.json().catch(() => ({}))) as { id?: string }).id ?? '') }
    const text = (await res.text().catch(() => '')).slice(0, 200)
    return { ok: false, reason: `Resend ${res.status} ${text}`.trim(), retryAfterS: res.status === 429 ? Number(res.headers.get('retry-after') ?? 2) : undefined }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'network error' }
  }
}

/** One test copy to the signed-in admin. Does not mark anyone as sent. */
export async function sendTest(uid: string, email: string | undefined) {
  if (!launchMailConfigured()) throw new HttpError(503, 'Email is not set up (RESEND_API_KEY).', 'BR-LCH-001')
  if (!email) throw new HttpError(400, 'Your account has no email address to send the test to.')
  const r = await resend(email, uid, `launch-test-${uid}-${Date.now()}`, '[test] ')
  if (!r.ok) throw new HttpError(502, `The test email was not accepted: ${r.reason}`, 'BR-LCH-002')
  return { ok: true }
}

/** Mails the next chunk. Returns what happened and how many are left in the current list. */
export async function sendChunk(db: Firestore) {
  if (!launchMailConfigured()) throw new HttpError(503, 'Email is not set up (RESEND_API_KEY).', 'BR-LCH-001')
  await unsubUrls('check') // fails early if there is no secret to sign links with
  const started = Date.now()
  const runRef = db.collection('launchEmail').doc('_run')
  let run = (await runRef.get()).data() as { list: string[]; next: number; createdAt: Timestamp } | undefined

  // A new list: everyone verified, not opted out, not yet sent. Built once, then worked through chunk by chunk.
  if (!run || run.next >= run.list.length || Date.now() - run.createdAt.toMillis() > 12 * 3_600_000) {
    const [all, out] = await Promise.all([accounts(), optedOut(db)])
    const todo = all.filter(a => a.verified && !out.uids.has(a.uid) && !out.emails.has(a.email))
    const sent = await sentSet(db, todo.map(a => a.email))
    const list = todo.filter(a => !sent.has(a.email)).map(a => `${a.uid}|${a.email}`)
    run = { list, next: 0, createdAt: Timestamp.now() }
    await runRef.set(run)
  }

  const slice = run.list.slice(run.next, run.next + CHUNK).map(s => { const i = s.indexOf('|'); return { uid: s.slice(0, i), email: s.slice(i + 1) } })
  // Re-check opt-outs right now: someone may have unsubscribed since the list was built.
  const userDocs = slice.length ? await db.getAll(...slice.map(r => db.collection('users').doc(r.uid)), { fieldMask: ['emailOptOut'] }) : []
  let sent = 0, failed = 0, skipped = 0, processed = 0
  const failures: string[] = []
  let lastCall = 0

  for (const [i, r] of slice.entries()) {
    if (Date.now() - started > BUDGET_MS) break
    processed++
    if (userDocs[i]?.get('emailOptOut') === true) { skipped++; continue }
    const ref = db.collection('launchEmail').doc(keyOf(r.email))
    const claim = await db.runTransaction(async tx => {
      const d = await tx.get(ref)
      const st = d.get('status'), at = (d.get('claimedAt') as Timestamp | undefined)?.toMillis() ?? 0
      if (st === 'sent') return 'sent'
      if (st === 'sending' && Date.now() - at < STALE_CLAIM_MS) return 'busy'
      tx.set(ref, { email: r.email, uid: r.uid, status: 'sending', claimedAt: Timestamp.now(), attempts: FieldValue.increment(1) }, { merge: true })
      return 'ok'
    })
    if (claim !== 'ok') { skipped++; continue }

    let res: SendResult = { ok: false, reason: 'not tried' }
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = GAP_MS - (Date.now() - lastCall)
      if (wait > 0) await sleep(wait)
      lastCall = Date.now()
      res = await resend(r.email, r.uid, `launch-${keyOf(r.email)}`)
      if (res.ok || res.retryAfterS === undefined) break
      await sleep(Math.min(10, Math.max(1, res.retryAfterS)) * 1000) // Resend said slow down
    }
    if (res.ok) {
      await ref.set({ status: 'sent', sentAt: Timestamp.now(), resendId: res.id, error: FieldValue.delete() }, { merge: true })
      sent++
    } else {
      failed++
      const reason = res.reason
      failures.push(`${r.email}: ${reason}`)
      console.error('[launch email] failed', r.email, reason)
      await ref.set({ status: 'failed', failedAt: Timestamp.now(), error: reason }, { merge: true })
      await db.collection('launchEmailFailures').add({ email: r.email, uid: r.uid, reason, at: Timestamp.now() }).catch(() => {})
    }
  }

  const next = run.next + processed
  await runRef.update({ next })
  const remaining = Math.max(0, run.list.length - next)
  return { sent, failed, skipped, remaining, done: remaining === 0, ...(failures.length ? { failures } : {}) }
}
