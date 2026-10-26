import { NextResponse, type NextRequest } from 'next/server'
import { PASS_COOKIE, PASS_HEADER, launchOpen, lockedUserMayCall, passUid, publicWhileLocked } from '@/lib/launchLock'

// Launch lock. Before the launch time (lib/launch.ts) only the public pages and APIs are reachable; everything else needs a
// launch pass (cookie, or the X-Launch-Pass header for the app), which /api/launch/pass hands to admins,
// directors and radio-trained students. After the launch time this returns at once and costs nothing.
// The server checks again on every signed-in API call (lib/server/launchAccess.ts), so this is a second lock, not the only one.
export async function proxy(req: NextRequest) {
  if (launchOpen()) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (publicWhileLocked(pathname)) return NextResponse.next()
  // Profile and sign-up follow-ups (name, color, About you, delete account) work for everyone who is signed in. The route checks the sign-in itself.
  if (pathname.startsWith('/api/') && lockedUserMayCall(pathname)) return NextResponse.next()

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
  // The lock only matters for pages and APIs that are NOT public while locked. So the matcher skips everything the lock would let through anyway
  // (keep this list in step with PUBLIC_PAGES and PUBLIC_APIS in lib/launchLock.ts): Next's own files, static files, the countdown page ("/" needs
  // at least one more character to match, so it is skipped), and the public pages and APIs. Skipped requests never start the function.
  matcher: ['/((?!_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|\\.well-known/|apple-app-site-association|(?:auth|privacy|terms|unsubscribe|delete-account|coming-soon|support)(?:/|$)|api/(?:launch|unsubscribe|auth|cron|webhooks|health)(?:/|$)|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|css|js|map|mp3|mp4|txt|xml|webmanifest)$).+)'],
}
