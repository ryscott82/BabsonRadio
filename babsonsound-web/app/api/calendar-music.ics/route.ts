import { adminDb } from '@/lib/server/admin'
import { buildCalendar } from '@/lib/server/calendar'

export const runtime = 'nodejs'

// Subscribable calendar of the auto DJ playlist blocks only: https://<site>/api/calendar.ics (add it as "from URL" in any calendar app).
export async function GET() {
  try {
    return new Response(await buildCalendar(adminDb(), Date.now(), 'auto'), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="babson-radio-music.ics"',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    })
  } catch (e) {
    console.error('[calendar-music]', e)
    return new Response('Calendar is unavailable right now.', { status: 503 })
  }
}
