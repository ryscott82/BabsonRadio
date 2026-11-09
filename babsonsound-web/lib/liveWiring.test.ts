import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Guards for the CPU work: these read the source and fail if someone puts a separate poll back, drops the token cache, or removes the meters.
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('the live page parts read the bundle and no longer poll the separate routes', () => {
  const old = [/\/api\/skip/, /\/api\/vote['`?]/, /\/api\/live\/setlist'\)/, /\/api\/live\/rating\?/, /\/api\/host\/access/, /fetchPresence\(/]
  for (const f of ['components/SkipButton.tsx', 'components/VoteCard.tsx', 'components/LiveExtras.tsx', 'components/LivePlayer.tsx', 'components/Nav.tsx']) {
    const s = src(f)
    assert.match(s, /useLiveBundle/, `${f} should use the bundle`)
    for (const re of old) {
      for (const line of s.split('\n')) {
        // Posting an action (api(...)) to the old routes is fine; reading (apiGet) is not.
        if (re.test(line) && /apiGet|fetchPresence/.test(line)) assert.fail(`${f} still reads an old route: ${line.trim()}`)
      }
    }
  }
})

test('the web page asks only through the shared store, with no sign-in header on the shared half', () => {
  const s = src('lib/liveStore.ts')
  assert.match(s, /apiGetPublic<BundleReply>\(`\/api\/live\/bundle\?part=shared/)
  assert.match(s, /apiGet<BundleReply>\(`\/api\/live\/bundle\?part=me/)
  assert.match(s, /SHARED_MS/); assert.match(s, /PERSONAL_MS/)
  assert.match(s, /dueFor\(/)
  assert.match(s, /document\.hidden/)
})

test('the listening check-in is every 60 s and keeps going in a hidden tab (no hidden check around it)', () => {
  const s = src('lib/listenGuard.ts')
  assert.match(s, /LISTEN_BEAT_MS/)
  assert.doesNotMatch(s, /30_000/)
  const beat = s.slice(s.indexOf('LISTEN_BEAT_MS &&'), s.indexOf('LISTEN_BEAT_MS &&') + 400)
  assert.doesNotMatch(beat, /document\.hidden/)
})

test('the page no longer sends its own presence heartbeat while playing (the listening check-in refreshes it)', () => {
  const s = src('components/LivePlayer.tsx')
  assert.doesNotMatch(s, /sendHeartbeat\(true\), \d+/)
  assert.match(s, /sendHeartbeat\(true\)/)
  assert.match(s, /sendHeartbeat\(false\)/)
  const g = src('app/api/listen/route.ts')
  assert.match(g, /recordPresence\(/)
  assert.match(g, /PRESENCE_EVERY_MS/)
})

test('sign-in tokens are remembered per instance, forgotten on account deletion, and every request is metered for CPU', () => {
  const h = src('lib/server/http.ts')
  assert.match(h, /createTokenCache</)
  assert.match(h, /verified\.get\(m\[1\]\)/)
  assert.match(h, /export const forgetTokens/)
  assert.match(h, /cpuMeterRequest\(/)
  assert.match(h, /meterRequest\(/)
  assert.match(src('lib/server/deleteAccount.ts'), /forgetTokens\(uid\)/)
  // the verified-email rule still runs on every call, cached or not
  assert.match(h, /await enforceVerified\(req, t\)/)
})

test('the bundle route sends the cache header that matches the half it returns, and the old routes still exist', () => {
  const r = src('app/api/live/bundle/route.ts')
  assert.match(r, /cacheControlFor\(want\)/)
  assert.match(r, /requireUser\(req\)/)
  for (const f of ['app/api/presence/route.ts', 'app/api/skip/route.ts', 'app/api/vote/route.ts', 'app/api/live/setlist/route.ts',
    'app/api/live/emojis/route.ts', 'app/api/live/rating/route.ts', 'app/api/host/access/route.ts']) {
    assert.match(src(f), /export async function GET/, `${f} must keep working for older apps`)
  }
})

test('the admin pages for the CPU meter exist and are admin only', () => {
  assert.match(src('app/api/admin/cpu-meter/route.ts'), /requireAdmin\(req\)/)
  assert.match(src('app/admin/server-load/page.tsx'), /\/api\/admin\/cpu-meter/)
  assert.match(src('app/admin/page.tsx'), /\/admin\/server-load/)
})
