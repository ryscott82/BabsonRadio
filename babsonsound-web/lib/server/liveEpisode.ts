import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { az, azuraConfigured, station } from './azuracast'
import { azFindMedia, azPlaylistList, azSetPlaylists } from './azuraMedia'
import { liveEpisodeDoc, type LiveShowInfo } from '../recordingsCore'

// A live show the studio PC archived becomes an audio episode in the Babson Sound library, played straight from AzuraCast.
// The file goes into an "on-demand" playlist (named ARCHIVE_PLAYLIST) that is switched off for the radio, so it never airs; AzuraCast serves
// files in on-demand playlists to anyone with the link, which is what the library player uses. Needs "Enable on-demand streaming" on the
// station (AzuraCast: Station Profile > Edit Profile > Streaming).
export const ARCHIVE_PLAYLIST = process.env.ARCHIVE_PLAYLIST_NAME || 'Show archive'

async function archivePlaylistId(): Promise<number> {
  const hit = (await azPlaylistList()).find(p => p.name.toLowerCase() === ARCHIVE_PLAYLIST.toLowerCase())
  if (hit) return hit.id
  const made = await az<{ id: number }>(`/station/${station()}/playlists`, {
    method: 'POST',
    body: JSON.stringify({ name: ARCHIVE_PLAYLIST, is_enabled: false, type: 'default', source: 'songs', order: 'shuffle', weight: 1, include_in_requests: false, include_in_on_demand: true }),
  })
  return made.id
}

/** Makes the library episode for a finished live recording (id = the recording's id, so calling it again changes nothing). */
export async function publishLiveEpisode(db: Firestore, recId: string): Promise<'published' | 'exists' | 'skipped'> {
  const rec = await db.collection('recordings').doc(recId).get()
  if (!rec.exists || rec.get('kind') !== 'live') return 'skipped'
  const epRef = db.collection('episodes').doc(recId)
  if ((await epRef.get()).exists) return 'exists'
  const path = String(rec.get('azuracastPath') ?? '')
  if (!path || !azuraConfigured()) throw new Error('AzuraCast is not set up on the site.')
  const media = await azFindMedia(path, 5)
  if (!media) throw new Error('The recording is not in AzuraCast yet.')
  const pl = await archivePlaylistId()
  await azSetPlaylists(media.id, [...new Set([...media.playlists.map(p => p.id).filter(Boolean), pl])])
  const live = rec.get('live') as LiveShowInfo
  const doc = liveEpisodeDoc({
    title: String(rec.get('title') ?? 'Live show'), uid: String(rec.get('uid') ?? ''), durationSec: Number(rec.get('durationSec') ?? 0),
    azuracastPath: path, mediaId: media.id, uniqueId: media.uniqueId, live: live ?? { hosts: [], description: '', category: '', startedAt: 0, endedAt: 0 }, recordingId: recId,
    crewUids: Array.isArray(rec.get('crewUids')) ? (rec.get('crewUids') as unknown[]).map(String) : [],
  })
  const at = Timestamp.fromMillis(live?.startedAt || rec.get('createdAt')?.toMillis?.() || Date.now())
  await epRef.set({ ...doc, publishedAt: at })
  await rec.ref.update({ status: 'aired', episodeId: recId })
  return 'published'
}
