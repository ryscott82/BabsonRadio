import 'server-only'
import { cpuState } from './cpuBudget'

/**
 * Where a page can watch AzuraCast's own public now-playing feed, or null (the normal case: keep asking our /api/nowplaying).
 * It is set only when the backup way is on (Admin: nowPlayingDirect 'on', or 'auto' once the month is close to the limit). The feed carries no key.
 * Never throws: if the meter cannot be read, the normal way stays.
 */
export async function directFeed(): Promise<{ url: string } | null> {
  const base = (process.env.AZURACAST_URL ?? '').replace(/\/+$/, '')
  if (!base) return null
  try {
    if (!(await cpuState()).directFeed) return null
  } catch { return null }
  return { url: `${base}/api/nowplaying/${encodeURIComponent(process.env.AZURACAST_STATION_ID || '1')}` }
}
