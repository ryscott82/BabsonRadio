// The one launch time for the whole site. Safe to import anywhere (no env, no server code).
// Oct 30, 2026 at 10:00 am Eastern (EDT) = 14:00 UTC. Matches `launchAt` from /api/launch/status.
export const LAUNCH_ISO = '2026-10-30T10:00:00-04:00'
export const LAUNCH_MS = Date.parse(LAUNCH_ISO)
export const LAUNCH_TEXT = 'October 30th at 10am Eastern'

/** Days, hours, minutes and seconds left (all zero once it has passed). */
export function timeLeft(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, mins: Math.floor(s / 60) % 60, secs: s % 60 }
}
