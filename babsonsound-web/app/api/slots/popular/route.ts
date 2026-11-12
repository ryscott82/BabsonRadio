import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireMember } from '@/lib/server/http'
import { loadPopular } from '@/lib/server/popularTimes'
import { cellsFor, gridLevels, topWindows } from '@/lib/popularCore'
import { SLOT_CATEGORIES } from '@/lib/slots'

export const runtime = 'nodejs'

// Popular times for the Host a show grid: GET ?category=podcast (leave it out for the whole station).
//   { top: [{ day, startHour, endHour, avg, label }] (best two-hour windows), grid: 7 x 24 of 0-3 (Sunday first, station time), sample, fallback, updatedAt }
// Aggregates only. `fallback` is true when the category has too little history (fewer than 3 shows) and station-wide listening is shown. One small saved
// document, kept 5 minutes on the server and shared by everyone; the page is told it may keep it 5 minutes too.
export async function GET(req: Request) {
  return handle(async () => {
    await requireMember(req)
    const category = new URL(req.url).searchParams.get('category') ?? ''
    if (category && !(SLOT_CATEGORIES as readonly string[]).includes(category)) throw new HttpError(400, 'Pick a category from the list.')
    const doc = await loadPopular(adminDb())
    if (!doc) return { top: [], grid: gridLevels(new Array(168).fill(0)), sample: 0, fallback: true, updatedAt: null }
    const c = cellsFor(doc, category || null)
    return { top: topWindows(c.cells), grid: gridLevels(c.cells), sample: c.sample, fallback: c.fallback, updatedAt: doc.builtAt }
  }, { 'Cache-Control': 'private, max-age=300' })
}
