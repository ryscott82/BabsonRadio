import 'server-only'
import { NextResponse } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminAuth } from './admin'
import { classifyServerError, codeForMessage } from '../errors'
import { counted } from './cpuBudget'

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

export async function requireUser(req: Request): Promise<DecodedIdToken> {
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer (.+)$/i)
  if (!m) throw new HttpError(401, 'Sign in required.')
  try {
    return await adminAuth().verifyIdToken(m[1])
  } catch {
    throw new HttpError(401, 'Your session expired. Please sign in again.')
  }
}

// Babson Radio is open to Babson, Olin and Wellesley students. (The name is historical.)
export const BABSON_EMAIL = /^[a-z0-9._%+-]+@(babson|olin|wellesley)\.edu$/

/** New accounts get a `graceUntil` claim (ms) at sign-up: they can use the platform until then without verifying. */
export const graceActive = (t: DecodedIdToken) => typeof t.graceUntil === 'number' && Date.now() < t.graceUntil

/** Any well-formed email address (beta testers can come from any domain). */
export const ANY_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** Beta testers carry a `tester` claim (set at sign-up from the allowlist) that gives them member access. */
export const isTesterToken = (t: DecodedIdToken) => t.tester === true

export function isBabsonToken(t: DecodedIdToken): boolean {
  if (!(t.email_verified === true || graceActive(t)) || !t.email) return false
  return BABSON_EMAIL.test(t.email.toLowerCase()) || isTesterToken(t) || t.openMember === true
}

/** Developer accounts are created by script with a custom claim; they don't need a babson.edu email. */
export const isDeveloperToken = (t: DecodedIdToken) => t.developer === true

/** Babson student with a verified babson.edu address. */
export async function requireBabson(req: Request): Promise<DecodedIdToken> {
  const t = await requireUser(req)
  if (!isBabsonToken(t)) {
    throw new HttpError(403, 'Verify your school email to do this.')
  }
  return t
}

/** Verified Babson student OR developer. */
export async function requireMember(req: Request): Promise<DecodedIdToken> {
  const t = await requireUser(req)
  if (!isBabsonToken(t) && !isDeveloperToken(t)) {
    throw new HttpError(403, 'Verify your school email to do this.')
  }
  return t
}

/** Developer, or a verified Babson student whose users doc says superAdmin. */
export async function requireStaff(req: Request): Promise<DecodedIdToken> {
  const t = await requireUser(req)
  if (isDeveloperToken(t)) return t
  if (isBabsonToken(t)) {
    const { adminDb } = await import('./admin')
    const u = await adminDb().collection('users').doc(t.uid).get()
    if (u.get('role') === 'superAdmin') return t
  }
  throw new HttpError(403, 'Staff only.')
}

/** Directors (show times and slot requests only), plus admins and developers. */
export async function requireDirector(req: Request): Promise<DecodedIdToken> {
  const t = await requireUser(req)
  if (isDeveloperToken(t)) return t
  if (isBabsonToken(t)) {
    const { adminDb } = await import('./admin')
    const role = (await adminDb().collection('users').doc(t.uid).get()).get('role')
    if (role === 'superAdmin' || role === 'director') return t
  }
  throw new HttpError(403, 'Directors and admins only.')
}

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
    return NextResponse.json(await counted(bucket, fn), headers ? { headers } : undefined)
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
