import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { liveStateTick } from '@/lib/server/liveStateTick'
import { directFeed } from '@/lib/server/directFeed'
import { autoApproveTick } from '@/lib/server/autoApprove'

export const runtime = 'nodejs'

// What is playing on the stream right now. Same data for the website and the iOS app. The playlist name is staff-only, so it is blanked here.
// Tier 0: always on. The edge keeps it 8 s (then serves the old copy for 20 s more while it refreshes), so a crowd runs this at most about every 8 s.
// Each run also checks whether the song, show or voting hour changed, and if so updates the pushed document (lib/server/liveStateTick.ts).
export async function GET() {
  const np = await getNowPlaying()
  after(() => liveStateTick(adminDb(), np))
  after(() => autoApproveTick(adminDb())) // approves show requests that are due; one real check every 5 minutes per server at most
  // `direct` is set only when the backup way is on: pages then watch AzuraCast's feed and ask us only when something changed (lib/nowplaying.ts).
  return NextResponse.json({ ...np, playlist: '', direct: await directFeed() }, { headers: { 'Cache-Control': 'public, s-maxage=8, stale-while-revalidate=20' } })
}
