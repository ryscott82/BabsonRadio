import registry from './error-codes.json'

export interface ErrorInfo {
  code: string
  title: string
  meaning: string
  userFix: string
  staffCheck: string
}

/** Single source of truth. Edit lib/error-codes.json, then run `node scripts/gen-error-docs.mjs`. */
export const ERROR_LIST: ErrorInfo[] = registry

/** "Message (BR-ACC-003)" — the form people see and can quote to support. */
export const withCode = (message: string, code: string, ref?: string) =>
  `${message} (${code}${ref ? `, ref ${ref}` : ''})`

// Messages already used by our API routes → code. Order matters (first match wins).
const RULES: [RegExp, string][] = [
  [/sign in required/i, 'BR-AUTH-002'],
  [/session expired/i, 'BR-AUTH-003'],
  [/sign in again to delete/i, 'BR-AUTH-004'],
  [/verify your (babson\.edu )?email/i, 'BR-AUTH-005'],
  [/registered babson student|babson student's @babson/i, 'BR-GST-001'],
  [/requires a @babson\.edu/i, 'BR-ACC-001'],
  [/already exists/i, 'BR-ACC-002'],
  [/phone number is already/i, 'BR-ACC-003'],
  [/10-digit/i, 'BR-ACC-004'],
  [/password/i, 'BR-ACC-005'],
  [/give your show|pick (live|a category)|audio link|audio links/i, 'BR-SLT-005'],
  [/first name/i, 'BR-ACC-006'],
  [/confirmation missing/i, 'BR-ACC-007'],
  [/profile not found/i, 'BR-ACC-008'],
  [/enter a valid email/i, 'BR-ACC-009'],
  [/staff only|only the sponsoring/i, 'BR-PERM-002'],
  [/can sign in directly|already have access/i, 'BR-GST-005'],
  [/sponsor up to/i, 'BR-GST-002'],
  [/too many requests today/i, 'BR-GST-003'],
  [/not configured yet/i, 'BR-GST-004'],
  [/contact sync limit/i, 'BR-NET-001'],
  [/hashes/i, 'BR-NET-002'],
  [/pending request/i, 'BR-SLT-003'],
  [/already booked|now taken/i, 'BR-SLT-002'],
  [/start time|length must|hours ahead|days ahead|already passed|already started|pick a start time/i, 'BR-SLT-001'],
  [/can no longer be cancelled|already handled/i, 'BR-SLT-004'],
  [/not found/i, 'BR-REQ-002'],
]

export function codeForMessage(status: number, message: string): string {
  for (const [re, code] of RULES) if (re.test(message)) return code
  if (status === 401) return 'BR-AUTH-002'
  if (status === 403) return 'BR-PERM-001'
  if (status === 404) return 'BR-REQ-002'
  if (status === 429) return 'BR-REQ-003'
  if (status >= 500) return 'BR-SRV-000'
  return 'BR-REQ-001'
}

/** Turns an unexpected exception on the server into the most specific setup/infra code. */
export function classifyServerError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const raw = (e as { code?: unknown })?.code
  const c = String(raw ?? '')
  if (/FIREBASE_SERVICE_ACCOUNT_JSON is not set/i.test(msg)) return 'BR-SRV-001'
  if (e instanceof SyntaxError || /private key|PEM|service account|Unexpected token|JSON/i.test(msg)) return 'BR-SRV-002'
  if (/PHONE_HASH_PEPPER/i.test(msg)) return 'BR-SRV-003'
  if (/PII_KEY/i.test(msg)) return 'BR-SRV-009'
  if (/configuration-not-found|CONFIGURATION_NOT_FOUND/i.test(c + msg)) return 'BR-SRV-006'
  if (c === '9' || /failed-precondition|requires an index/i.test(c + msg)) return 'BR-SRV-005'
  if (c === '5' || /NOT_FOUND|database.*does not exist/i.test(c + msg)) return 'BR-SRV-004'
  if (c === '7' || /PERMISSION_DENIED|insufficient permission/i.test(c + msg)) return 'BR-SRV-007'
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|DEADLINE_EXCEEDED|UNAVAILABLE/i.test(c + msg)) return 'BR-SRV-008'
  return 'BR-SRV-000'
}

/** Firebase client-SDK (browser) auth error → code. */
export function firebaseAuthCode(e: unknown): string {
  switch ((e as { code?: string })?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials': return 'BR-AUTH-001'
    case 'auth/too-many-requests': return 'BR-AUTH-006'
    case 'auth/network-request-failed': return 'BR-CLI-001'
    case 'auth/operation-not-allowed': return 'BR-AUTH-008'
    case 'auth/unauthorized-domain': return 'BR-AUTH-009'
    case 'auth/user-disabled': return 'BR-AUTH-010'
    case 'auth/email-already-in-use': return 'BR-ACC-002'
    case 'auth/invalid-email': return 'BR-ACC-009'
    case 'auth/weak-password': return 'BR-ACC-005'
    default: return 'BR-AUTH-007'
  }
}

export function messageForCode(code: string, fallback: string): string {
  switch (code) {
    case 'BR-AUTH-001': return 'Incorrect email or password.'
    case 'BR-AUTH-006': return 'Too many attempts. Wait a few minutes and try again.'
    case 'BR-CLI-001': return "Can't reach Babson Radio. Check your connection."
    case 'BR-AUTH-008': return 'Sign-in is not available right now.'
    case 'BR-AUTH-009': return 'Sign-in is not available on this web address.'
    case 'BR-AUTH-010': return 'This account has been disabled.'
    default: return fallback
  }
}
