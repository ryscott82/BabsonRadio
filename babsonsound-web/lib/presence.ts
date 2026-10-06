import { auth } from '@/lib/firebase'
import { api, apiGet } from '@/lib/auth'

export interface PresenceInfo {
  count: number
  friends: { uid: string; firstName: string }[]
}

/** Tell the server we're (still) listening. Safe to call when signed out — it just does nothing. */
export async function sendHeartbeat(listening: boolean) {
  if (!auth.currentUser) return
  await api('/api/presence', { listening }).catch(() => {})
}

/** Listener count for everyone; connected, visible friends' first names for verified students. */
export async function fetchPresence(): Promise<PresenceInfo> {
  return apiGet<PresenceInfo>('/api/presence').catch(() => ({ count: 0, friends: [] }))
}

export function friendsLine(friends: { firstName: string }[]): string {
  const n = friends.length
  if (n === 0) return ''
  if (n === 1) return `${friends[0].firstName} is tuned in`
  if (n === 2) return `${friends[0].firstName} and ${friends[1].firstName} are tuned in`
  return `${friends[0].firstName}, ${friends[1].firstName} and ${n - 2} more you know are tuned in`
}
