'use client'

import { useNowPlaying } from '@/lib/nowplaying'
import { useWide } from '@/lib/useWide'
import LiveExtras from '@/components/LiveExtras'

/** Reactions, ratings, set list and skip, shown in the right-hand pane on desktop. On narrow screens they stay under the player. */
export default function LiveExtrasPane() {
  const np = useNowPlaying()
  const wide = useWide()
  if (!wide) return null
  return <LiveExtras np={np} />
}
