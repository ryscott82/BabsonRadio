import 'server-only'
import { NextResponse } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminAuth } from './admin'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
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

export const BABSON_EMAIL = /^[a-z0-9._%+-]+@babson\.edu$/

export function isBabsonToken(t: DecodedIdToken): boolean {
  return t.email_verified === true && !!t.email && BABSON_EMAIL.test(t.email.toLowerCase())
}

/** Developer accounts are created by script with a custom claim; they don't need a babson.edu email. */
export const isDeveloperToken = (t: DecodedIdToken) => t.developer === true

/** Babson student with a verified babson.edu address. */
export async function requireBabson(req: Request): Promise<DecodedIdToken> {
  const t = await requireUser(req)
  if (!isBabsonToken(t)) {
    throw new HttpError(403, 'Verify your babson.edu email to do this.')
  }
  return t
}

/** Verified Babson student OR developer. */
export async function requireMember(req: Request): Promise<DecodedIdToken> {
  const t = await requireUser(req)
  if (!isBabsonToken(t) && !isDeveloperToken(t)) {
    throw new HttpError(403, 'Verify your babson.edu email to do this.')
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

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return NextResponse.json(await fn())
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error(e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
