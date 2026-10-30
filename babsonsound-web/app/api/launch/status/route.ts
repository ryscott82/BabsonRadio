import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// The site is open. This stays only so app versions that still read the launch status keep working.
export async function GET() {
  return NextResponse.json({ open: true, launchAt: '2026-10-30T04:00:00Z', locked: false }, { headers: { 'Cache-Control': 'public, s-maxage=300' } })
}
