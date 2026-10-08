import 'server-only'
import { adminDb } from './admin'

// Pre-launch: only emails on this list can create a Babson Radio account or get past the "Radio is back" page.
// Stored in Firestore config/betaTesters (server-only), managed at /admin/testers.
export const normEmail = (e: string) => e.trim().toLowerCase()

export async function testerEmails(): Promise<string[]> {
  const d = await adminDb().collection('config').doc('betaTesters').get()
  return ((d.get('emails') as string[] | undefined) ?? []).map(normEmail).sort()
}

export async function isTester(email: string | undefined | null): Promise<boolean> {
  if (!email) return false
  return (await testerEmails()).includes(normEmail(email))
}

/** Email the "you've been selected" note to anyone on this list who has not had it yet. Returns how many were sent. */
export async function welcomeTesters(emails: string[]): Promise<{ sent: number; configured: boolean }> {
  const { betaWelcome, mailConfigured, sendMail } = await import('./mailer')
  if (!mailConfigured()) return { sent: 0, configured: false }
  const ref = adminDb().collection('config').doc('betaTesters')
  const done = new Set(((await ref.get()).get('welcomed') as string[] | undefined) ?? [])
  const todo = [...new Set(emails.map(normEmail))].filter(e => !done.has(e))
  const ok: string[] = []
  for (const e of todo) {
    const m = betaWelcome(e)
    if (await sendMail(e, m.subject, m.text, m.html)) ok.push(e)
  }
  if (ok.length) await ref.set({ welcomed: (await import('firebase-admin/firestore')).FieldValue.arrayUnion(...ok) }, { merge: true })
  return { sent: ok.length, configured: true }
}
