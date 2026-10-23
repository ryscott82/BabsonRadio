import { NextResponse } from 'next/server'
import { launchAtIso, launchAtMs, launchOpen } from '@/lib/launchLock'
import { isLocked } from '@/lib/server/launchAccess'
import { requireUser } from '@/lib/server/http'

export const runtime = 'nodejs'

// The launch countdown reads this.
//   Anonymous:  { open, launchAt }                 cached at the edge, so a page full of visitors costs almost nothing.
//   Signed in:  { open, launchAt, locked }         one call per person, never cached.
// `open` flips by itself at the launch time. The cache is trimmed so it never straddles that moment.
export async function GET(req: Request) {
  const now = Date.now()
  const open = launchOpen(now)
  const body = { open, launchAt: launchAtIso() }

  if (req.headers.get('authorization')) {
    try {
      const t = await requireUser(req)
      return NextResponse.json({ ...body, locked: await isLocked(t) }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch { /* a bad or expired token is treated as a visitor */ }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const secondsToLaunch = Math.max(1, Math.ceil((launchAtMs() - now) / 1000))
  const ttl = open ? 300 : Math.min(60, secondsToLaunch)
  return NextResponse.json(body, { headers: { 'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=0` } })
}
