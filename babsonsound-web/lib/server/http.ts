import 'server-only'
import { NextResponse } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminAuth } from './admin'
import { classifyServerError, codeForMessage } from '../errors'
import { counted } from './cpuBudget'
import { meterRequest, noteMeterPath } from './readMeter'
import { cpuMeterRequest } from './cpuMeter'
import { createTokenCache } from '../tokenCache'
import { lockedMayCall } from '../verifyClock'

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

// Signed-in people call us every minute or so with the same token. A token that was already checked is remembered for up to 5 minutes
// on this server instance (and never past its own expiry, see lib/tokenCache.ts), so the signature check runs once, not on every call.
// Everything after it (verified-email rule, access level) still runs on every request.
const verified = createTokenCache<DecodedIdToken>()
/** Forget a person's remembered tokens (call when their account is deleted or their sign-in is revoked). */
export const forgetTokens = (uid: string) => verified.forgetUid(uid)
export const tokenCacheStats = () => verified.stats()

export async function requireUser(req: Request): Promise<DecodedIdToken> {
  noteMeterPath(req)
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer (.+)$/i)
  if (!m) throw new HttpError(401, 'Sign in required.')
  let t = verified.get(m[1])
  if (!t) {
    try {
      t = await adminAuth().verifyIdToken(m[1])
    } catch {
      throw new HttpError(401, 'Your session expired. Please sign in again.')
    }
    verified.set(m[1], t)
  }
  await enforceVerified(req, t)
  return t
}

/**
 * Verify within 7 days: after the grace period an unverified account can reach only /api/me, /api/auth and a few account
 * routes (lib/verifyClock.ts). The demo / reviewer account is exempt. Accounts with no email are not
 * locked, since there is nothing to verify. Verified accounts (nearly everyone) skip this with no extra work.
 */
async function enforceVerified(req: Request, t: DecodedIdToken) {
  if (t.email_verified === true || !t.email || graceActive(t)) return
  if (lockedMayCall(new URL(req.url).pathname)) return
  const { accessOf } = await import('./access')
  if ((await accessOf(t)).demo) return
  throw new HttpError(403, 'Verify your email to keep using Babson Radio.', 'BR-ACC-021')
}

// Access levels live in ./access (guest | student | director | admin). Guards below all return the verified token.
export { SCHOOL_EMAIL as BABSON_EMAIL } from './access'

/** Any well-formed email address (anyone can sign up; non-school addresses become guests). */
export const ANY_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** New accounts get a `graceUntil` claim (ms) at sign-up: they can use the platform until then without verifying. */
export const graceActive = (t: DecodedIdToken) => typeof t.graceUntil === 'number' && Date.now() < t.graceUntil

async function need(req: Request, ok: (a: import('./access').Access) => boolean, msg: string, code = 'BR-PERM-002'): Promise<DecodedIdToken> {
  const t = await requireUser(req)
  const { accessOf } = await import('./access')
  if (!ok(await accessOf(t))) throw new HttpError(403, msg, code)
  return t
}

/** Student, director or admin (verified school email). Guests get 403. */
export const requireStudent = (req: Request) =>
  need(req, a => a.level !== 'guest', 'This is for Babson, Olin and Wellesley students.', 'BR-PERM-001')
/** Kept so older call sites read the same: members are students and above. */
export const requireMember = requireStudent
export const requireBabson = requireStudent
/**
 * A student (or above) whose school email is actually verified. The 7-day grace period is not enough: contact matching can be
 * used to look up phone numbers, so it needs a verified identity. The App Store reviewer account is exempt.
 */
export async function requireVerifiedMember(req: Request): Promise<DecodedIdToken> {
  const t = await requireStudent(req)
  const { accessOf } = await import('./access')
  if (t.email_verified !== true && !(await accessOf(t)).demo) {
    throw new HttpError(403, 'Verify your school email to use contacts.', 'BR-CON-004')
  }
  return t
}
/** Student or above who is radio trained (directors and admins always are). Needed for live shows. */
export const requireRadioTrained = (req: Request) =>
  need(req, a => a.level !== 'guest' && a.radio, 'Finish radio training to go live.')
/** Director or admin. */
export const requireDirector = (req: Request) =>
  need(req, a => a.level === 'director' || a.level === 'admin', 'Directors and admins only.')
/** Admin only. */
export const requireAdmin = (req: Request) => need(req, a => a.level === 'admin', 'Admins only.')
export const requireStaff = requireAdmin

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid request body.')
  }
  return body as Record<string, unknown>
}

export function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export async function handle(fn: () => Promise<unknown>, headers?: Record<string, string>, bucket: 'reactions' | 'other' = 'other'): Promise<Response> {
  try {
    return NextResponse.json(await meterRequest(() => cpuMeterRequest(() => counted(bucket, fn))), headers ? { headers } : undefined)
  } catch (e) {
    if (e instanceof HttpError) {
      const code = e.code ?? codeForMessage(e.status, e.message)
      return NextResponse.json({ error: e.message, code }, { status: e.status })
    }
    // Unexpected: classify for setup problems and tag with a short reference that also appears in the logs.
    const code = classifyServerError(e)
    const ref = Math.random().toString(16).slice(2, 8)
    console.error(`[${code}] ref=${ref}`, e)
    return NextResponse.json({ error: 'Something went wrong on our end.', code, ref }, { status: 500 })
  }
}
