import 'server-only'
import { az, azuraConfigured, station } from './azuracast'

// The station's music library in AzuraCast: upload, list, put in playlists, delete. The API key needs the "Manage Station Media" permission.

export interface MediaFile { id: number; path: string; title: string; artist: string; playlists: { id: number; name: string }[] }
export interface PlaylistInfo { id: number; name: string }

const need = () => { if (!azuraConfigured()) throw new Error('AzuraCast is not configured') }

export async function azPlaylistList(): Promise<PlaylistInfo[]> {
  need()
  const lists = await az<{ id: number; name: string }[]>(`/station/${station()}/playlists`)
  return lists.map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Every file in the library (AzuraCast has no folder filter on this list, so callers filter). */
export async function azMediaList(): Promise<MediaFile[]> {
  need()
  type Row = { id: number; path?: string; title?: string; artist?: string; text?: string; playlists?: ({ id?: number; name?: string } | number)[] }
  const raw = await az<Row[] | { rows?: Row[] }>(`/station/${station()}/files`)
  const rows = Array.isArray(raw) ? raw : (raw.rows ?? [])
  return rows.map(r => ({
    id: r.id,
    path: r.path ?? '',
    title: r.title ?? r.text ?? '',
    artist: r.artist ?? '',
    playlists: (r.playlists ?? []).map(p => (typeof p === 'number' ? { id: p, name: '' } : { id: p.id ?? 0, name: p.name ?? '' })),
  }))
}

/**
 * Sends one piece of an upload the way AzuraCast's own upload box does (flow.js chunks). `dir` is the folder, "" for the top.
 * Resolves true when AzuraCast says the whole file has arrived.
 */
export async function azUploadChunk(o: { dir: string; filename: string; index: number; total: number; totalSize: number; chunkSize: number; id: string; data: Blob }): Promise<boolean> {
  need()
  const form = new FormData()
  const rel = o.dir ? `${o.dir}/${o.filename}` : o.filename
  form.set('flowChunkNumber', String(o.index + 1))
  form.set('flowChunkSize', String(o.chunkSize))
  form.set('flowCurrentChunkSize', String(o.data.size))
  form.set('flowTotalSize', String(o.totalSize))
  form.set('flowIdentifier', o.id)
  form.set('flowFilename', o.filename)
  form.set('flowRelativePath', rel)
  form.set('flowTotalChunks', String(o.total))
  form.set('currentDirectory', o.dir)
  form.set('file_data', o.data, o.filename)
  const base = (process.env.AZURACAST_URL ?? '').replace(/\/+$/, '')
  const res = await fetch(`${base}/api/station/${station()}/files/upload?currentDirectory=${encodeURIComponent(o.dir)}`, {
    method: 'POST',
    headers: { 'X-API-Key': process.env.AZURACAST_API_KEY ?? '' },
    body: form,
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AzuraCast ${res.status} on upload: ${text.slice(0, 200)}`)
  }
  return o.index + 1 >= o.total
}

/** Finds a just-uploaded file by its path. AzuraCast reads it in the background, so this retries for a few seconds. */
export async function azFindMedia(path: string, tries = 4): Promise<MediaFile | null> {
  for (let i = 0; i < tries; i++) {
    const hit = (await azMediaList()).find(m => m.path === path)
    if (hit) return hit
    if (i < tries - 1) await new Promise(r => setTimeout(r, 2000))
  }
  return null
}

/** Sets exactly which playlists a file is in. */
export async function azSetPlaylists(mediaId: number, playlistIds: number[]): Promise<void> {
  need()
  const url = `/station/${station()}/file/${encodeURIComponent(String(mediaId))}`
  try {
    await az(url, { method: 'PUT', body: JSON.stringify({ playlists: playlistIds }) })
  } catch {
    // Some AzuraCast versions want the playlists as objects.
    await az(url, { method: 'PUT', body: JSON.stringify({ playlists: playlistIds.map(id => ({ id })) }) })
  }
}

export async function azDeleteMedia(mediaId: number): Promise<void> {
  need()
  await az(`/station/${station()}/file/${encodeURIComponent(String(mediaId))}`, { method: 'DELETE' })
}
