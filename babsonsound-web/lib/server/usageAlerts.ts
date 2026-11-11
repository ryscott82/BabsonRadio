import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { escapeHtml, mailConfigured, sendMail } from './mailer'
import { ownerEmails } from './access'
import { daysInMonth, projectedOver, thresholdsToFire, THRESHOLDS } from '../serverUsage'
import type { CpuState } from './cpuBudget'

// Server-time alerts: at 50 / 75 / 90 / 100% of the monthly allowance (our own meter, or the latest number typed into the usage log) an
// admin notice is created and owners and admins are emailed. Each threshold fires once a month, for good: the alert is a document created
// with `create()`, which fails if it already exists, so two servers (or a restart) can never send it twice. The normal path reads nothing:
// a server only touches Firestore when a threshold is crossed that it has not seen yet.
//   usageAlerts/{YYYY-MM}_{50|75|90|100|projected}   { month, kind, pct, source, hours, allowance, at, emailed }

const seen = new Set<string>() // ids this instance already knows exist

const ref = (db: Firestore, id: string) => db.collection('usageAlerts').doc(id)

/** Emails of everyone who should hear about server time: the owners (OWNER_EMAILS) and every admin account. */
export async function alertRecipients(db: Firestore): Promise<string[]> {
  const out = new Set(ownerEmails())
  try {
    const snap = await db.collection('users').where('level', '==', 'admin').select('email').get()
    for (const d of snap.docs) { const e = String(d.get('email') ?? '').trim().toLowerCase(); if (e) out.add(e) }
  } catch (e) { console.error('[usage alerts] admins', e) }
  return [...out]
}

export function alertMail(o: { title: string; lines: string[] }) {
  const link = 'https://babsonradio.com/admin/server-load'
  const text = ['Hi,', '', ...o.lines, '', `Details and the usage log: ${link}`, '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5"><p>Hi,</p>${
    o.lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${link}" style="color:#006644">Open server load</a></p><p>Babson Radio</p></div>`
  return { subject: o.title, text, html }
}

/** Create the alert once. Returns true only for the caller that created it (so only that caller sends the email). */
async function claim(db: Firestore, id: string, data: Record<string, unknown>): Promise<boolean> {
  if (seen.has(id)) return false
  try { await ref(db, id).create({ ...data, at: Timestamp.now(), emailed: false }); seen.add(id); return true }
  catch (e) {
    if ((e as { code?: number }).code === 6) { seen.add(id); return false } // ALREADY_EXISTS
    throw e
  }
}

async function email(db: Firestore, id: string, mail: { subject: string; text: string; html: string }) {
  if (!mailConfigured()) return
  const to = await alertRecipients(db)
  const results = await Promise.all(to.map(a => sendMail(a, mail.subject, mail.text, mail.html)))
  await ref(db, id).set({ emailed: results.some(Boolean), emailedTo: to.length }, { merge: true }).catch(() => {})
}

const fmt = (h: number) => (Math.round(h * 100) / 100).toString()

/** Raises the threshold alert for `pct` of the allowance. `source` says where the number came from. */
export async function raiseThreshold(db: Firestore, o: { month: string; pct: number; hours: number; allowance: number; source: 'meter' | 'entry' }) {
  const fired = THRESHOLDS.filter(t => seen.has(`${o.month}_${t}`))
  const { announce, mark } = thresholdsToFire(o.pct, fired)
  for (const t of mark) {
    if (t === announce) continue
    await claim(db, `${o.month}_${t}`, { month: o.month, kind: 'threshold', pct: t, source: o.source, hours: o.hours, allowance: o.allowance, silent: true }).catch(() => {})
  }
  if (!announce) return
  const id = `${o.month}_${announce}`
  if (!(await claim(db, id, { month: o.month, kind: 'threshold', pct: announce, source: o.source, hours: o.hours, allowance: o.allowance }))) return
  const where = o.source === 'entry' ? 'the latest number entered from Vercel' : 'our own server-time meter'
  const lines = [
    `Server time is at ${announce}% of this month's allowance (${fmt(o.hours)} of ${fmt(o.allowance)} hours, from ${where}).`,
    announce >= 100 ? 'The site may be paused by Vercel until the next cycle.' : announce >= 90 ? 'Tier 2 features (voting, skipping, presence) will be switched off if it keeps climbing.' : 'Reactions and the emoji palette slow down first if it keeps climbing.',
  ]
  await email(db, id, alertMail({ title: `Babson Radio server time: ${announce}% used`, lines }))
}

/** Called about every 30 seconds per server from the meter's own computation. Cheap unless a threshold is newly crossed. */
export async function checkMeterAlerts(db: Firestore, s: CpuState, now = Date.now()) {
  const allowance = s.config.budgetHours
  if (!(allowance > 0)) return
  const pct = (s.usedHours / allowance) * 100
  const month = s.month
  if (THRESHOLDS.some(t => pct >= t && !seen.has(`${month}_${t}`))) await raiseThreshold(db, { month, pct, hours: s.usedHours, allowance, source: 'meter' })
  const dom = new Date(now).getUTCDate()
  if (projectedOver(s.projectedHours, allowance, dom) && !seen.has(`${month}_projected`)) await raiseProjected(db, { month, projected: s.projectedHours, allowance, source: 'meter' })
}

export async function raiseProjected(db: Firestore, o: { month: string; projected: number; allowance: number; source: 'meter' | 'entry' }) {
  const id = `${o.month}_projected`
  if (!(await claim(db, id, { month: o.month, kind: 'projected', pct: Math.round((o.projected / o.allowance) * 100), source: o.source, hours: o.projected, allowance: o.allowance }))) return
  const lines = [
    `At the current rate this month will end at about ${fmt(o.projected)} server hours, over the ${fmt(o.allowance)} hour allowance (${o.source === 'entry' ? 'from the latest number entered from Vercel' : 'from our own meter'}).`,
    `The month has ${daysInMonth(o.month)} days. Check which features are using the most time and consider locking a tier.`,
  ]
  await email(db, id, alertMail({ title: 'Babson Radio server time is on track to run out', lines }))
}

/** After an entry is added or edited: look at the latest number and the projection it gives. */
export async function checkEntryAlerts(db: Firestore, o: { month: string; hours: number; projected: number; allowance: number; dayOfMonth: number }) {
  const pct = (o.hours / o.allowance) * 100
  // Learn which thresholds exist already (this server may not have seen them), then raise any new one.
  const existing = await db.collection('usageAlerts').where('month', '==', o.month).select('kind').get().catch(() => null)
  existing?.docs.forEach(d => seen.add(d.id))
  await raiseThreshold(db, { month: o.month, pct, hours: o.hours, allowance: o.allowance, source: 'entry' })
  if (projectedOver(o.projected, o.allowance, o.dayOfMonth) && !seen.has(`${o.month}_projected`)) await raiseProjected(db, { month: o.month, projected: o.projected, allowance: o.allowance, source: 'entry' })
}

/** Alerts for one month, or for several (the alert history on the Server load page), oldest first. */
export async function alertsFor(db: Firestore = adminDb(), month: string | string[]) {
  const months = Array.isArray(month) ? month : [month]
  const snap = await (months.length === 1 ? db.collection('usageAlerts').where('month', '==', months[0]) : db.collection('usageAlerts').where('month', 'in', months.slice(0, 10))).get()
  return snap.docs.map(d => ({ id: d.id, month: String(d.get('month') ?? ''), kind: d.get('kind') as string, pct: Number(d.get('pct') ?? 0), source: String(d.get('source') ?? ''), hours: Number(d.get('hours') ?? 0), allowance: Number(d.get('allowance') ?? 0), at: (d.get('at') as Timestamp | undefined)?.toMillis() ?? 0, silent: d.get('silent') === true, emailed: d.get('emailed') === true, emailedTo: Number(d.get('emailedTo') ?? 0) }))
    .sort((a, b) => a.at - b.at)
}

export const forgetAlertMemory = () => seen.clear()
