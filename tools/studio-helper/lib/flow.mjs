// Upload one file to AzuraCast the way its own upload box does (flow.js chunks), so a stopped upload can pick up where it stopped:
// before each chunk a GET asks whether AzuraCast already has it (200 = yes, skip it). The last chunk is always sent, because that is what
// makes AzuraCast put the pieces together. Same API the website uses (lib/server/azuraMedia.ts), not SFTP.

export const CHUNK_BYTES = 2 * 1024 * 1024

/** AzuraCast renames each uploaded file part (Strings::getProgrammaticString). Doing the same here means we know the final path. */
export function azFileName(s) {
  return String(s)
    .replace(/[^\p{L}\p{N}_\s\-~,;[\]().]/gu, '')
    .replace(/\.{2,}/g, '.')
    .replace(/ /g, '_')
    .toLowerCase()
}

/** "2026-11-12_1530_my_show_ab12cd.mp3": date and time it was recorded, the title, a short id, the extension. */
export function recordingFileName(title, createdAt, id, ext) {
  const d = new Date(createdAt)
  const p = n => String(n).padStart(2, '0')
  const when = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
  const name = azFileName(String(title).normalize('NFKD').replace(/[̀-ͯ]/g, '')).replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '').slice(0, 60) || 'recording'
  const e = /^\.[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : '.mp3'
  return `${when}_${name}_${String(id).slice(0, 6).toLowerCase()}${e}`
}

export const chunkCount = (size, chunk = CHUNK_BYTES) => Math.max(1, Math.ceil(size / chunk))

/**
 * o: { base, key, station, dir, filename, identifier, size, chunkSize?, readChunk(start, end) -> Promise<Uint8Array>, fetch, onProgress?(sentBytes),
 *      timeoutMs? }. Resolves when AzuraCast says the file is in; throws on any failure (the caller retries with backoff).
 */
export async function flowUpload(o) {
  const chunk = o.chunkSize || CHUNK_BYTES
  const total = chunkCount(o.size, chunk)
  const url = `${o.base}/api/station/${o.station}/files/upload`
  const fields = (i, len) => ({
    flowChunkNumber: String(i + 1), flowChunkSize: String(chunk), flowCurrentChunkSize: String(len), flowTotalSize: String(o.size),
    flowIdentifier: o.identifier, flowFilename: o.filename, flowRelativePath: o.filename, flowTotalChunks: String(total), currentDirectory: o.dir,
  })
  const headers = { 'X-API-Key': o.key, Accept: 'application/json' }
  const timeout = () => AbortSignal.timeout(o.timeoutMs || 60_000)
  // Two passes at most: if the last chunk says "not everything is here" (204), the GETs find the missing chunks and the last one goes again.
  for (let pass = 0; pass < 2; pass++) {
    let sent = 0
    for (let i = 0; i < total; i++) {
      const start = i * chunk, end = i === total - 1 ? o.size : start + chunk
      const f = fields(i, end - start)
      if (i < total - 1) {
        const q = new URLSearchParams(f)
        const t = await o.fetch(`${url}?${q}`, { method: 'GET', headers, signal: timeout() })
        if (t.status === 200) { sent = end; o.onProgress?.(sent); continue }
        if (t.status !== 204 && t.status !== 404) throw new Error(`AzuraCast answered ${t.status} when checking the upload.`)
      }
      const form = new FormData()
      for (const [k, v] of Object.entries(f)) form.set(k, v)
      form.set('file_data', new Blob([await o.readChunk(start, end)]), o.filename)
      const res = await o.fetch(`${url}?currentDirectory=${encodeURIComponent(o.dir)}`, { method: 'POST', headers, body: form, signal: timeout() })
      if (!res.ok) throw new Error(`AzuraCast answered ${res.status} on upload: ${(await res.text().catch(() => '')).slice(0, 160)}`)
      sent = end
      o.onProgress?.(sent)
      if (i === total - 1) {
        if (res.status === 204) break // not all pieces there yet: another pass
        const body = await res.json().catch(() => ({}))
        if (body && body.success === false) throw new Error(`AzuraCast could not take the file: ${String(body.message || 'unknown error').slice(0, 160)}`)
        return true
      }
    }
  }
  throw new Error('AzuraCast did not put the file together.')
}

/** Makes the folder (fine if it is already there). */
export async function ensureFolder(o) {
  const r = await o.fetch(`${o.base}/api/station/${o.station}/files/mkdir`, {
    method: 'POST', headers: { 'X-API-Key': o.key, 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ currentDirectory: '', name: o.dir }), signal: AbortSignal.timeout(20_000),
  }).catch(() => null)
  return !!r && r.ok
}

/** The AzuraCast media id of a file by its path, or 0 when it is not listed yet (AzuraCast reads new files in the background). */
export async function findMediaId(o, path) {
  const q = new URLSearchParams({ currentDirectory: o.dir, flushCache: 'true' })
  const r = await o.fetch(`${o.base}/api/station/${o.station}/files/list?${q}`, { headers: { 'X-API-Key': o.key, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
  if (!r.ok) return 0
  const raw = await r.json().catch(() => [])
  const rows = Array.isArray(raw) ? raw : raw.rows ?? []
  const hit = rows.find(x => x && x.path === path)
  return Number(hit?.media?.id || hit?.media_id || 0) || 0
}
