import { azHistory } from '@/lib/server/azuracast'
import { HttpError, handle, requireStaff } from '@/lib/server/http'
import { localToUtc } from '@/lib/server/tz'

export const runtime = 'nodejs'
export const maxDuration = 60

const TZ = 'America/New_York'
const esc = (v: string | number | boolean) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Play log for royalty reporting: every track that aired, with time, artist, title, album, ISRC (when AzuraCast knows it),
// length and the playlist or live DJ it came from. ?from=YYYY-MM-DD&to=YYYY-MM-DD (station time, both days included) ; returns { count, filename, csv }
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const url = new URL(req.url)
    const parse = (v: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] as const : null }
    const f = parse(url.searchParams.get('from')), t = parse(url.searchParams.get('to'))
    if (!f || !t) throw new HttpError(400, 'Pick a start and end date.', 'BR-OPS-001')
    const startMs = localToUtc(f[0], f[1], f[2], 0, TZ)
    const endMs = localToUtc(t[0], t[1], t[2], 24 * 60, TZ)
    if (endMs <= startMs) throw new HttpError(400, 'The end date must not be before the start date.', 'BR-OPS-001')
    if (endMs - startMs > 93 * 86_400_000) throw new HttpError(400, 'Pick 93 days or fewer at a time.', 'BR-OPS-002')

    const rows = await azHistory(startMs, endMs)
    const fmt = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(ms))
    const head = 'played_at_eastern,artist,title,album,isrc,seconds,playlist,live_dj,listener_request'
    const body = rows.map(r => [fmt(r.playedAt), r.artist, r.title, r.album, r.isrc, r.durationSec, r.playlist, r.streamer, r.isRequest].map(esc).join(','))
    const from = url.searchParams.get('from'), to = url.searchParams.get('to')
    return { count: rows.length, filename: `babson-radio-playlog-${from}-to-${to}.csv`, csv: [head, ...body].join('\n') }
  })
}
