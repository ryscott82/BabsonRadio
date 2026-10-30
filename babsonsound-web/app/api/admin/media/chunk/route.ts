import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireAdmin } from '@/lib/server/http'
import { azUploadChunk } from '@/lib/server/azuraMedia'
import { logMedia, reserveChunk } from '@/lib/server/uploads'
import { CHUNK_BYTES, chunkCount, cleanFileName, cleanFolder } from '@/lib/uploads'

export const runtime = 'nodejs'
export const maxDuration = 30

// Admin only. One piece (up to 3 MB) of an .mp3 upload; the browser sends the pieces in order and this passes each on to the radio.
// The allowance is checked and counted before anything is sent on (see lib/server/uploads.ts).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const f = await req.formData()
    const part = f.get('part')
    const name = cleanFileName(String(f.get('name') ?? ''))
    const dir = cleanFolder(String(f.get('dir') ?? ''))
    const index = Number(f.get('index')), total = Number(f.get('total')), totalSize = Number(f.get('totalSize'))
    const id = String(f.get('id') ?? '')
    if (!(part instanceof Blob) || !/\.mp3$/i.test(name) || dir === null || !/^[a-z0-9-]{8,64}$/.test(id)) throw new HttpError(400, 'That upload is not valid.')
    if (!Number.isInteger(index) || !Number.isInteger(total) || !Number.isFinite(totalSize) || totalSize <= 0 || total !== chunkCount(totalSize) || index < 0 || index >= total) throw new HttpError(400, 'That upload is not valid.')
    if (part.size <= 0 || part.size > CHUNK_BYTES + 1024) throw new HttpError(400, 'That piece is the wrong size.')
    const db = adminDb()
    const verdict = await reserveChunk(db, part.size, totalSize, index === 0)
    if (!verdict.ok) throw new HttpError(429, verdict.reason)
    const done = await azUploadChunk({ dir, filename: name, index, total, totalSize, chunkSize: CHUNK_BYTES, id, data: part })
    if (done) await logMedia(db, t.uid, 'upload', dir ? `${dir}/${name}` : name)
    return { done, path: dir ? `${dir}/${name}` : name, ...(verdict.warn ? { warn: verdict.warn } : {}) }
  })
}
