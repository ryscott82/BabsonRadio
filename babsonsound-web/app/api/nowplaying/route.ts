import { NextResponse } from 'next/server'
import { getNowPlaying } from '@/lib/server/nowplaying'

export const runtime = 'nodejs'

// What is playing on the stream right now. Same data for the website and the iOS app.
export async function GET() {
  return NextResponse.json(await getNowPlaying(), { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' } })
}
