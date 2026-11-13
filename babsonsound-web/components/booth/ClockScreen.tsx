'use client'

import { useEffect, useState } from 'react'
import { adBreak, type AdPlan } from '@/lib/booth'
import { mmss } from './helper'

// Small notices for the top of the booth: time left in the show, an ad break coming up, talking for too long, and the station ID reminder
// at the top of each hour while live. Nothing shows when there is nothing to say.

interface Show { title: string; startAt: number; endAt: number }

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const TALK_LONG_S = 5 * 60
const AD_NOTICE_MS = 5 * 60_000

export default function ClockScreen(p: { show: Show | null; ads: AdPlan | null; live: boolean; lastMusicAt: number; onPlayId: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [idDone, setIdDone] = useState(-1)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])

  let timeLabel = '', timeValue = '', timeWarn = false
  if (p.show && now < p.show.startAt) { timeLabel = `Starts at ${clock(p.show.startAt)} in`; timeValue = mmss((p.show.startAt - now) / 1000) }
  else if (p.show && now <= p.show.endAt) { const left = (p.show.endAt - now) / 1000; timeLabel = left <= 300 ? 'Time left, wrap up' : 'Time left'; timeValue = mmss(left); timeWarn = left <= 300 }
  else if (p.show) { timeLabel = 'Over time'; timeValue = `+${mmss((now - p.show.endAt) / 1000)}`; timeWarn = true }

  const ad = p.ads ? adBreak(p.ads, now) : null
  const adShown = !!ad && (ad.now || ad.start - now <= AD_NOTICE_MS)
  const talking = p.live && p.lastMusicAt ? (now - p.lastMusicAt) / 1000 : 0

  const d = new Date(now), min = d.getMinutes(), hourKey = d.getHours() + (min >= 58 ? 1 : 0)
  const idDue = p.live && (min >= 58 || min <= 2) && idDone !== hourKey

  const pill = 'bp px-4 py-1.5 flex items-center gap-3 text-xl'
  return (
    <>
      {timeValue && <div className={pill}><span className="lbl">{timeLabel}</span><span className={`num text-3xl ${timeWarn ? 'warn' : ''}`}>{timeValue}</span></div>}
      {adShown && ad && <div className={pill}><span className="lbl">{ad.now ? 'Ad break, back in' : 'Ad break in'}</span><span className="num text-3xl warn">{mmss(((ad.now ? ad.end : ad.start) - now) / 1000)}</span></div>}
      {talking >= TALK_LONG_S && <div className={pill}><span className="lbl">Talking</span><span className="num text-3xl warn">{mmss(talking)}</span></div>}
      {idDue && (
        <div className={pill}>
          <span className="ok">Play the station ID</span>
          <button type="button" className="gbtn h-9 px-3 text-base" onClick={() => { p.onPlayId(); setIdDone(hourKey) }}>Play ID</button>
          <button type="button" className="gbtn h-9 px-3 text-base" onClick={() => setIdDone(hourKey)}>Done</button>
        </div>
      )}
    </>
  )
}
