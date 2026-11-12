// Rules for the station announcement (broadcast) that E-board and Admin can send.
// Pure, so the route and the tests share one copy.

export const BROADCAST_GAP_MS = 10 * 60_000 // at most one per person every 10 minutes
export const BROADCAST_TITLE_MAX = 60
export const BROADCAST_BODY_MAX = 160

export type SentRow = { by: string; at: number }

/** The sentence to show when this person sent one too recently, or null when they may send. */
export function broadcastWait(recent: SentRow[], uid: string, now: number): string | null {
  const mine = recent.filter(r => r.by === uid).map(r => r.at).sort((a, b) => b - a)[0]
  if (mine === undefined || now - mine >= BROADCAST_GAP_MS) return null
  const mins = Math.max(1, Math.ceil((BROADCAST_GAP_MS - (now - mine)) / 60_000))
  return `You sent an announcement a few minutes ago. You can send another in ${mins} minute${mins === 1 ? '' : 's'}.`
}

/** The line for the hostActions audit log. */
export function broadcastAudit(uid: string, title: string, recipients: number, at: unknown) {
  return { uid, action: 'broadcast', title, recipients, show: '(station)', at }
}
