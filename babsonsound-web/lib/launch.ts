// The one launch time for the whole site. Safe to import anywhere (no env, no server code).
// Oct 30, 2026 at 12:00 am Eastern (EDT) = 04:00 UTC (already past: the site is open). Matches `launchAt` from /api/launch/status.
export const LAUNCH_ISO = '2026-10-30T00:00:00-04:00'
export const LAUNCH_MS = Date.parse(LAUNCH_ISO)
export const LAUNCH_TEXT = 'October 30th at 3pm Eastern'

/** Days, hours, minutes and seconds left (all zero once it has passed). */
export function timeLeft(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, mins: Math.floor(s / 60) % 60, secs: s % 60 }
}
