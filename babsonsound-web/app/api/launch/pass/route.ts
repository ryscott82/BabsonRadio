import { HttpError, handle, requireUser } from '@/lib/server/http'
import { PASS_COOKIE, launchOpen, makePass } from '@/lib/launchLock'
import { hasEarlyAccess } from '@/lib/server/launchAccess'

export const runtime = 'nodejs'

const cookie = (value: string, maxAgeS: number) =>
  `${PASS_COOKIE}=${value}; Path=/; Max-Age=${maxAgeS}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`

// Admins, directors and radio-trained students trade their sign-in for a launch pass
// (an HttpOnly cookie for the website; `gate` is the same value for the app's X-Launch-Pass header).
// Locked people get a 403 and nothing else. After launch nobody needs a pass.
export async function POST(req: Request) {
  const res = await handle(async () => {
    const t = await requireUser(req)
    if (launchOpen()) return { open: true, gate: null }
    if (!(await hasEarlyAccess(t))) throw new HttpError(403, 'Babson Radio opens October 30 at 10 am. Your account is ready.', 'BR-PRE-003')
    const pass = await makePass(t.uid)
    if (!pass) throw new HttpError(503, 'The launch lock is not set up on the server.', 'BR-PRE-004')
    return { open: false, gate: pass.token, expiresAt: pass.expiresAt }
  }, { 'Cache-Control': 'no-store' })
  if (res.ok) {
    const j = await res.clone().json().catch(() => null) as { gate?: string | null } | null
    if (j?.gate) res.headers.append('Set-Cookie', cookie(j.gate, 12 * 3600))
  }
  return res
}

// Sign-out: drop the pass.
export async function DELETE() {
  const res = await handle(async () => ({ ok: true }), { 'Cache-Control': 'no-store' })
  res.headers.append('Set-Cookie', cookie('', 0))
  return res
}
