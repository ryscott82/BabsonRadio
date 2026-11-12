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

test('the web page asks only through the shared store: no sign-in header on the shared half, no short timers', () => {
  const s = src('lib/liveStore.ts')
  assert.match(s, /apiGetPublic<BundleReply>\(`\/api\/live\/bundle\?part=shared/)
  assert.match(s, /apiGet<BundleReply>\(`\/api\/live\/bundle\?part=me/)
  assert.match(s, /REFRESH_MS/)
  assert.doesNotMatch(s, /SHARED_MS|PERSONAL_MS/)
  assert.match(s, /dueFor\(/)
  assert.match(s, /document\.hidden/)
  assert.doesNotMatch(s, /5_000\)/, 'no five-second timer')
})

test('tallies are pushed: the store listens to liveState/current only while the tab is visible, and the rules let signed-in users read it but nobody write it', () => {
  const s = src('lib/liveStore.ts')
  assert.match(s, /onSnapshot\(doc\(db, LIVE_STATE_DOC\.collection, LIVE_STATE_DOC\.id\)/)
  assert.match(s, /wantsPush\(\{ visible: !document\.hidden/)
  assert.match(s, /detachPush\(\)/)
  const r = src('firestore.rules')
  const m = /match \/liveState\/\{id\} \{([^}]*)\}/.exec(r)
  assert.ok(m, 'rule for liveState')
  assert.match(m[1], /allow read: if signedIn\(\)/)
  assert.match(m[1], /allow write: if false/)
  for (const c of ['serverUsage', 'usageAlerts', 'cpuTierLog']) assert.ok(r.includes(`match /${c}/{id} { allow read, write: if false; }`), `${c} is server only`)
})

test('the server keeps the pushed document up to date only when something changed, after an action and when the song or show changes', () => {
  assert.match(src('lib/server/liveState.ts'), /publishDecision\(/)
  assert.match(src('app/api/live/bundle/route.ts'), /publishLiveState\(/)
  assert.match(src('app/api/nowplaying/route.ts'), /liveStateTick\(/)
  for (const f of ['app/api/skip/route.ts', 'app/api/vote/route.ts', 'app/api/live/setlist/route.ts']) assert.match(src(f), /publishNow\(/, f)
  // nothing that moves by itself goes in it
  assert.doesNotMatch(src('lib/liveState.ts').replace(/\/\/.*$/gm, ''), /presence/)
})

test('the listening check-in is one call at play, one about every 12 minutes, and keeps going in a hidden tab; idle and session limits make no calls', () => {
  const s = src('lib/listenGuard.ts')
  assert.match(s, /action: 'start'/)
  assert.match(s, /action: 'refresh'/)
  assert.doesNotMatch(s, /LISTEN_BEAT_MS|action: 'beat'/)
  assert.match(s, /refreshMs\.current/)
  assert.match(s, /RESUME_MIN_AGE_MS/)
  assert.match(s, /sessionMaxMin\.current/)
  assert.match(s, /keepalive: true/) // the stop that survives the page closing
  const tick = s.slice(s.indexOf('const t = setInterval(() => {'), s.indexOf('}, 15_000)'))
  assert.ok(tick.length > 100)
  assert.doesNotMatch(tick, /api\(|apiGet/, 'the minute-grained timer only looks at clocks; the check-in is its own function')
  assert.doesNotMatch(s.slice(s.indexOf('const checkIn'), s.indexOf('const t = setInterval')), /document\.hidden/)
})

test('the page sends no presence heartbeat of its own: the check-in records presence at play, at each refresh and at stop', () => {
  const s = src('components/LivePlayer.tsx')
  assert.doesNotMatch(s, /sendHeartbeat/)
  const g = src('app/api/listen/route.ts')
  assert.match(g, /recordPresence\(db, t\.uid, true/)
  assert.match(g, /recordPresence\(db, t\.uid, false/)
  // the server no longer counts listening minutes or checks idle time and session length
  assert.doesNotMatch(g.replace(/\/\/.*$/gm, ''), /listenDays|activeAgoSec|autoMin|dailyCapMin/)
  assert.match(g, /refreshSec: limits\.refreshSec/)
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
  assert.match(src('app/admin/server-load/page.tsx'), /\/api\/admin\/server-usage\/overview/)
  assert.match(src('app/api/admin/server-usage/overview/route.ts'), /requireAdmin\(req\)/)
  assert.match(src('app/api/admin/server-usage/status/route.ts'), /requireAdmin\(req\)/)
  assert.match(src('lib/adminMenu.ts'), /\/admin\/server-load/) // the menu (lib/adminMenu.ts, Admin only) links to it
})

test('every tiered route asks the gate, and Tier 0 (stream, now playing, schedule) never does', () => {
  const gated: [string, RegExp][] = [
    ['app/api/listen/route.ts', /throttled<Reply \| Deny>\('listen'/], ['app/api/skip/route.ts', /throttled\('skip'/], ['app/api/vote/route.ts', /throttled\('vote'/],
    ['app/api/live/setlist/route.ts', /throttled\('setlist'/], ['app/api/live/rating/route.ts', /throttled\('rating'/], ['app/api/live/emojis/route.ts', /throttled\('emojis'/],
    ['app/api/presence/route.ts', /throttled\('presence'/], ['app/api/me/route.ts', /throttled\('me'/], ['app/api/live/reactions/route.ts', /mayRun\('reactions'/],
  ]
  for (const [f, re] of gated) assert.match(src(f), re, f)
  for (const f of ['app/api/nowplaying/route.ts', 'app/api/schedule/route.ts']) assert.doesNotMatch(src(f), /throttled|mayRun|levelOf/, `${f} is Tier 0`)
  const b = src('lib/server/liveBundle.ts')
  for (const feat of ['presence', 'skip', 'vote', 'setlist', 'rating', 'emojis']) assert.ok(b.includes(`feature: '${feat}'`), `bundle section ${feat}`)
  assert.ok(!b.includes("feature: 'host'")) // host access is part of the personal bundle, not throttled
})

test('older apps: their polled routes answer again-requests from memory and the edge copies are long', () => {
  for (const [f, route] of [['app/api/skip/route.ts', 'skip'], ['app/api/vote/route.ts', 'vote'], ['app/api/live/setlist/route.ts', 'setlist'], ['app/api/live/rating/route.ts', 'rating'],
    ['app/api/live/emojis/route.ts', 'emojis'], ['app/api/host/access/route.ts', 'host'], ['app/api/presence/route.ts', 'presence']] as const) {
    assert.ok(src(f).includes(`oldPoll('${route}'`), f)
  }
  assert.match(src('app/api/nowplaying/route.ts'), /s-maxage=8/)
  assert.match(src('app/api/schedule/route.ts'), /s-maxage=300, stale-while-revalidate=600/)
  assert.match(src('app/api/presence/route.ts'), /s-maxage=60/)
})

test('the usage log, forecast and alerts exist, are admin only, and the weekly reminder rides on the existing daily cron', () => {
  assert.match(src('app/api/admin/server-usage/route.ts'), /requireAdmin\(req\)/)
  assert.match(src('app/api/admin/server-usage/forecast/route.ts'), /requireAdmin\(req\)/)
  assert.match(src('app/api/cron/birthdays/route.ts'), /runUsageReminder\(/)
  const v = JSON.parse(src('vercel.json')) as { crons: unknown[] }
  assert.equal(v.crons.length, 2, 'Vercel Hobby allows two cron jobs')
  assert.match(src('lib/server/usageAlerts.ts'), /\.create\(/) // an alert can only be created once
  assert.match(src('lib/server/cpuBudget.ts'), /checkMeterAlerts/)
  assert.match(src('lib/server/notices.ts'), /kind: 'usage'/)
})

test('now playing keeps the normal way unless the server says `direct`; the backup way is off the Tier 0 gate and shows nothing read from AzuraCast', () => {
  const r = src('app/api/nowplaying/route.ts')
  assert.match(r, /direct: await directFeed\(\)/)
  assert.doesNotMatch(r, /throttled|mayRun|levelOf/)
  assert.match(src('lib/server/directFeed.ts'), /cpuState\(\)\)\.directFeed/)
  const c = src('lib/nowplaying.ts')
  assert.match(c, /directRef\.current && directBad < 2/) // falls back to the normal way if the feed cannot be read
  assert.doesNotMatch(c.slice(c.indexOf('const watch')), /setNp\(/) // the feed is only watched; what is shown still comes from our route
})

test('the Server load page and the admin banner never poll: they load on open and on Refresh only', () => {
  for (const f of ['app/admin/server-load/page.tsx', 'components/admin/UsageBanner.tsx', 'components/admin/usage/Charts.tsx', 'components/admin/usage/EntryForm.tsx', 'components/admin/usage/History.tsx', 'components/admin/usage/TierPanel.tsx', 'components/admin/usage/FeatureImpact.tsx']) {
    assert.doesNotMatch(src(f), /setInterval|setTimeout|visibilitychange|onSnapshot/, `${f} must not poll`)
  }
  assert.match(src('app/admin/layout.tsx'), /<UsageBanner \/>/)
  assert.match(src('app/admin/server-load/page.tsx'), /Refresh/)
})
