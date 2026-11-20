// The daily reminder for accounts that never verified their email (see lib/verifyClock.ts). All outside work is passed in,
// so this file has no server imports and the tests can run it with fakes.
import { verifyStage } from './verifyClock.ts'

export type SweepUser = {
  uid: string
  email?: string | null
  emailVerified: boolean
  createdMs: number
  graceUntil: number | null
}

export type SweepDeps = {
  now: number
  /** Pages of Auth users. Called until it returns no `next`. */
  list: (token?: string) => Promise<{ users: SweepUser[]; next?: string }>
  /** The user's saved profile bits: demo flag, name, level, and whether the reminder already went out. */
  profile: (uid: string) => Promise<{ demo: boolean; name: string; level: string; reminded: boolean }>
  /** Sends the day-10 reminder. Returns false when mail is not set up or failed (then nothing is marked). */
  remind: (u: SweepUser) => Promise<boolean>
  markReminded: (uid: string) => Promise<void>
}

export async function sweepUnverified(d: SweepDeps) {
  const out = { scanned: 0, reminded: 0, skipped: 0, failed: 0 }
  let token: string | undefined
  do {
    const page = await d.list(token)
    token = page.next
    for (const u of page.users) {
      out.scanned++
      // Nothing to verify without an email.
      if (u.emailVerified || !u.email) continue
      const stage = verifyStage({ emailVerified: false, graceUntil: u.graceUntil, createdMs: u.createdMs, now: d.now })
      if (stage !== 'remind') continue
      try {
        const p = await d.profile(u.uid)
        if (p.demo) { out.skipped++; continue }
        if (!p.reminded) {
          if (await d.remind(u)) { await d.markReminded(u.uid); out.reminded++ } else out.skipped++
        }
      } catch (e) {
        out.failed++
        console.error('[unverified sweep]', u.uid, e)
      }
    }
  } while (token)
  return out
}
