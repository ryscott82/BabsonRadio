import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireAdmin } from '@/lib/server/http'
import { azuraConfigured } from '@/lib/server/azuracast'
import { azDeleteMedia, azFindMedia, azMediaList, azPlaylistList, azSetPlaylists } from '@/lib/server/azuraMedia'
import { loadUploadLimits, logMedia, saveUploadLimits, uploadState } from '@/lib/server/uploads'
import { cleanFolder } from '@/lib/uploads'

export const runtime = 'nodejs'
export const maxDuration = 30

// Admin only. ?view=state (default): upload allowance and the playlists. ?view=files&q=&folder=: the library (first 300 matches) and its folders.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const url = new URL(req.url)
    if (!azuraConfigured()) return { configured: false }
    if (url.searchParams.get('view') === 'files') {
      const all = await azMediaList()
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
      const folder = cleanFolder(url.searchParams.get('folder') ?? '') ?? ''
      const folders = [...new Set(all.map(f => f.path.split('/').slice(0, -1).join('/')).filter(Boolean))].sort()
      const hits = all.filter(f => (!folder || f.path.startsWith(`${folder}/`)) && (!q || `${f.path} ${f.title} ${f.artist}`.toLowerCase().includes(q)))
      return { total: all.length, matches: hits.length, files: hits.slice(0, 300), folders }
    }
    const [playlists, state] = await Promise.all([azPlaylistList().catch(() => []), uploadState(adminDb())])
    return { configured: true, playlists, state }
  })
}

// { action: 'playlists', path | mediaId, playlistIds } | { action: 'delete', mediaId, label } | { action: 'limits', ...limits }
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const db = adminDb()
    const b = await readJson(req)
    if (b.action === 'playlists') {
      const ids = Array.isArray(b.playlistIds) ? b.playlistIds.map(Number).filter(n => Number.isInteger(n) && n > 0) : []
      let mediaId = Number(b.mediaId)
      if (!Number.isInteger(mediaId) || mediaId <= 0) {
        const path = typeof b.path === 'string' ? b.path : ''
        const hit = path ? await azFindMedia(path) : null
        if (!hit) throw new HttpError(404, 'The file is still being read by the radio. Open it in the library in a minute and choose its playlists there.')
        mediaId = hit.id
      }
      await azSetPlaylists(mediaId, ids)
      await logMedia(db, t.uid, 'playlists', `${mediaId}: ${ids.join(',')}`)
      return { ok: true }
    }
    if (b.action === 'delete') {
      const mediaId = Number(b.mediaId)
      if (!Number.isInteger(mediaId) || mediaId <= 0) throw new HttpError(400, 'Which file?')
      await azDeleteMedia(mediaId)
      await logMedia(db, t.uid, 'delete', String(b.label ?? mediaId))
      return { ok: true }
    }
    if (b.action === 'limits') {
      const cur = await loadUploadLimits(db)
      const out: Record<string, number | boolean> = {}
      if (typeof b.enabled === 'boolean') out.enabled = b.enabled
      for (const [k, lo, hi] of [['monthlyMB', 1, 1_000_000], ['dailyMB', 1, 1_000_000], ['monthlyCalls', 1, 10_000_000], ['maxFileMB', 1, 500], ['pauseAtCpuPct', 10, 200]] as const) {
        if (b[k] === undefined) continue
        const v = Number(b[k])
        if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, `${k} is out of range.`)
        out[k] = v
      }
      await saveUploadLimits(db, out)
      return { ok: true, limits: { ...cur, ...out } }
    }
    throw new HttpError(400, 'Unknown action.')
  })
}
