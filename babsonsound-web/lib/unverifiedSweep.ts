// The daily clean-up of accounts that never verified their email (see lib/verifyClock.ts). All outside work is passed in,
// so this file has no server imports and the tests can run it with fakes.
import { verifyStage } from './verifyClock.ts'

export type SweepUser = {
  uid: string
  email?: string | null
  emailVerified: boolean
  createdMs: number
  graceUntil: number | null
  apple: boolean
}

export type SweepDeps = {
  now: number
  /** Pages of Auth users. Called until it returns no `next`. */
  list: (token?: string) => Promise<{ users: SweepUser[]; next?: string }>
  /** The user's saved profile bits: demo flag, name, level, and whether the reminder already went out. */
  profile: (uid: string) => Promise<{ demo: boolean; name: string; level: string; reminded: boolean }>
  /** Sends the day-10 reminder. Returns false when mail is not set up or failed (then nothing is marked). */
  remind: (u: SweepUser, deleteAt: number) => Promise<boolean>
  markReminded: (uid: string) => Promise<void>
  /** Writes the accountDeletions record BEFORE anything is removed; returns a function that marks it done. */
  logDelete: (u: SweepUser, p: { name: string; level: string }) => Promise<() => Promise<void>>
  /** deleteAccountData(uid): removes the data and the sign-in, which frees the email. */
  remove: (uid: string) => Promise<void>
  /** Safety cap per run (default 25) so one run stays well inside the function time limit. */
  maxDeletes?: number
}

export async function sweepUnverified(d: SweepDeps) {
  const out = { scanned: 0, reminded: 0, deleted: 0, skipped: 0, failed: 0 }
  const cap = d.maxDeletes ?? 25
  let token: string | undefined
  do {
    const page = await d.list(token)
    token = page.next
    for (const u of page.users) {
      out.scanned++
      // Nothing to verify without an email. Apple accounts that never set a school email have no clock either.
      if (u.emailVerified || !u.email) continue
      if (u.apple && u.graceUntil === null) continue
      const stage = verifyStage({ emailVerified: false, graceUntil: u.graceUntil, createdMs: u.createdMs, now: d.now })
      if (stage !== 'remind' && stage !== 'delete') continue
      try {
        const p = await d.profile(u.uid)
        if (p.demo) { out.skipped++; continue }
        if (stage === 'delete') {
          if (out.deleted >= cap) { out.skipped++; continue }
          const done = await d.logDelete(u, p)
          await d.remove(u.uid)
          await done()
          out.deleted++
        } else if (!p.reminded) {
          const end = u.graceUntil ?? u.createdMs + 7 * 86_400_000
          if (await d.remind(u, end + 7 * 86_400_000)) { await d.markReminded(u.uid); out.reminded++ } else out.skipped++
        }
      } catch (e) {
        out.failed++
        console.error('[unverified sweep]', u.uid, e)
      }
    }
  } while (token)
  return out
}
