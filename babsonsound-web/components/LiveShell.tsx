'use client'

import { useNowPlaying } from '@/lib/nowplaying'
import { LiveExtrasProvider } from '@/components/LiveExtras'

/** Wraps the live page so the player, the poll card and the extras share one set of reactions and ratings. */
export default function LiveShell({ children }: { children: React.ReactNode }) {
  const np = useNowPlaying()
  return <LiveExtrasProvider np={np}>{children}</LiveExtrasProvider>
}
