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
