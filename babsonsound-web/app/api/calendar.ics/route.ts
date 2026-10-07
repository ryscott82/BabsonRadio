import { adminDb } from '@/lib/server/admin'
import { buildCalendar } from '@/lib/server/calendar'

export const runtime = 'nodejs'

// Subscribable calendar feed: https://<site>/api/calendar.ics (add it as "from URL" in any calendar app).
export async function GET() {
  try {
    return new Response(await buildCalendar(adminDb()), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="babson-radio.ics"',
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
      },
    })
  } catch (e) {
    console.error('[calendar]', e)
    return new Response('Calendar is unavailable right now.', { status: 503 })
  }
}
