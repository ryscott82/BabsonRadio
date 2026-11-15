'use client'

import { useEffect, useState } from 'react'
import { adBreak, type AdPlan } from '@/lib/booth'

// The clock-driven notices on the booth panel: an ad break coming up, talking for too long, and the station ID reminder
// at the top of each hour while live. Nothing shows when there is nothing to say.

const TALK_LONG_S = 5 * 60
const AD_NOTICE_MS = 5 * 60_000

/** The ad break (from 5 minutes before it until it ends) and how long the host has been talking (once it passes 5 minutes), each tick. */
export function useClockNotices(ads: AdPlan | null, live: boolean, lastMusicAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  const ad = ads ? adBreak(ads, now) : null
  const talking = live && lastMusicAt ? (now - lastMusicAt) / 1000 : 0
  return { now, ad: ad && (ad.now || ad.start - now <= AD_NOTICE_MS) ? ad : null, talking: talking >= TALK_LONG_S ? talking : 0 }
}

/** The station ID is due around the top of the hour while live, until someone plays it or says it is done. */
export function useStationId(live: boolean) {
  const [now, setNow] = useState(() => Date.now())
  const [idDone, setIdDone] = useState(-1)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5_000); return () => clearInterval(t) }, [])
  const d = new Date(now), min = d.getMinutes(), hourKey = d.getHours() + (min >= 58 ? 1 : 0)
  return { due: live && (min >= 58 || min <= 2) && idDone !== hourKey, done: () => setIdDone(hourKey) }
}
