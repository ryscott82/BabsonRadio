import { NextResponse, type NextRequest } from 'next/server'
import { PASS_COOKIE, PASS_HEADER, launchOpen, passUid, publicWhileLocked } from '@/lib/launchLock'

// Launch lock. Before the launch time (lib/launch.ts) only the public pages and APIs are reachable; everything else needs a
// launch pass (cookie, or the X-Launch-Pass header for the app), which /api/launch/pass hands to admins,
// directors and radio-trained students. After the launch time this returns at once and costs nothing.
// The server checks again on every signed-in API call (lib/server/launchAccess.ts), so this is a second lock, not the only one.
export async function proxy(req: NextRequest) {
  if (launchOpen()) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (publicWhileLocked(pathname)) return NextResponse.next()

  const pass = req.cookies.get(PASS_COOKIE)?.value ?? req.headers.get(PASS_HEADER) ?? req.headers.get('x-preview-key')
  if (await passUid(pass)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: "Babson Radio isn't open yet.", code: 'BR-PRE-001' },
      { status: 401, headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } },
    )
  }
  const res = NextResponse.redirect(new URL('/', req.url))
  res.headers.set('X-Robots-Tag', 'noindex')
  return res
}

export const config = {
  // Skip Next's own assets and static files so the public pages can load their fonts/images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)'],
}
