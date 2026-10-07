import { NextResponse, type NextRequest } from 'next/server'
import { PRELAUNCH_COOKIE, calendarKey, cookieValid, safeEqual, passwordMatches, prelaunchOn } from '@/lib/prelaunch'

// Pre-launch lock: until PRELAUNCH_OFF=1, only /coming-soon is public. Everything else needs the
// developer password (cookie from the unlock form, or an X-Preview-Key header for the iOS app).
export async function proxy(req: NextRequest) {
  if (!prelaunchOn()) return NextResponse.next()

  const { pathname } = req.nextUrl
  // /api/cron/* authenticates itself with CRON_SECRET (Vercel Cron can't send our cookie).
  if (pathname === '/coming-soon' || pathname === '/api/prelaunch/unlock' || pathname.startsWith('/api/cron/')) return NextResponse.next()

  if (pathname === '/api/calendar.ics') {
    const k = req.nextUrl.searchParams.get('k') ?? '', want = await calendarKey()
    if (want && safeEqual(k, want)) return NextResponse.next()
  }

  const unlocked =
    (await cookieValid(req.cookies.get(PRELAUNCH_COOKIE)?.value)) ||
    (await passwordMatches(req.headers.get('x-preview-key') ?? '')) ||
    // the app stores the unlock token (not the password) after a developer sign-in
    (await cookieValid(req.headers.get('x-preview-key') ?? undefined))
  if (unlocked) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: "Babson Radio isn't open yet.", code: 'BR-PRE-001' },
      { status: 401, headers: { 'X-Robots-Tag': 'noindex' } },
    )
  }
  const res = NextResponse.redirect(new URL('/coming-soon', req.url))
  res.headers.set('X-Robots-Tag', 'noindex')
  return res
}

export const config = {
  // Skip Next's own assets and static files so the countdown page can load its fonts/images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)'],
}
