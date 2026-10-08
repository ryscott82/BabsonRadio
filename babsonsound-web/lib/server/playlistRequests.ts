import 'server-only'
import type { DocumentSnapshot } from 'firebase-admin/firestore'
import { azPlaylistNames } from './azuracast'
import { DEFAULT_VOTE_GENRES } from './votes'
import { DEFAULT_CONFIG } from '../autoschedule'

// "Add this song to a playlist" requests. Listeners pick a playlist from a menu and type a title and artist.
// Each request remembers who was on air: a host's show (it shows in their panel) or the auto DJ (admins only).
// Admins always see every request.

/** The playlists listeners can pick from: AzuraCast's enabled playlists, else the genres the scheduler uses. */
export async function requestablePlaylists(): Promise<string[]> {
  const live = await azPlaylistNames()
  if (live.length) return live
  return [...new Set([...DEFAULT_CONFIG.rules.flatMap(r => r.fillers), ...DEFAULT_CONFIG.defaultFillers, ...DEFAULT_VOTE_GENRES])].sort((a, b) => a.localeCompare(b))
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export interface PlaylistRequestRow {
  id: string; title: string; artist: string; playlist: string; names: string[]; count: number
  at: number; done: boolean; occId: string; show: string
}

export function rowOf(d: DocumentSnapshot): PlaylistRequestRow {
  return {
    id: d.id, title: d.get('title') ?? '', artist: d.get('artist') ?? '', playlist: d.get('playlist') ?? '',
    names: d.get('names') ?? [], count: (d.get('uids') ?? []).length || 1, at: d.get('at')?.toMillis?.() ?? 0,
    done: d.get('done') === true, occId: d.get('occId') ?? '', show: d.get('showTitle') ?? '',
  }
}
