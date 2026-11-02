'use client'

import { useEffect, useState } from 'react'
import { adBreak, type AdPlan } from '@/lib/booth'
import { mmss } from './helper'

// The main read-out: the show's name, time left (big), then the next ad break, how long the host has been
// talking, and how long the stream has been on. Station ID reminder at the top of each hour while live.

interface Show { title: string; startAt: number; endAt: number }
interface Next { title: string; hosts: string[]; startAt: number }

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const TALK_LONG_S = 5 * 60

export default function ClockScreen(p: {
  show: Show | null; next: Next | null; ads: AdPlan | null
  live: boolean; onAirSeconds: number; lastMusicAt: number; onPlayId: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [idDone, setIdDone] = useState(-1)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])

  let label = 'Time', value = clock(now), red = false, sub = ''
  if (p.show && now < p.show.startAt) { label = 'Starts in'; value = mmss((p.show.startAt - now) / 1000); sub = `${clock(p.show.startAt)} to ${clock(p.show.endAt)}` }
  else if (p.show && now <= p.show.endAt) { const left = (p.show.endAt - now) / 1000; label = left <= 300 ? 'Time left · wrap up' : 'Time left'; value = mmss(left); red = left <= 300; sub = `ends ${clock(p.show.endAt)}` }
  else if (p.show) { label = 'Over time'; value = `+${mmss((now - p.show.endAt) / 1000)}`; red = true; sub = `ended ${clock(p.show.endAt)}` }

  const ad = p.ads ? adBreak(p.ads, now) : null
  const adSoon = !!ad && (ad.now || ad.start - now <= 60_000)
  const talking = p.live && p.lastMusicAt ? (now - p.lastMusicAt) / 1000 : 0

  const d = new Date(now), min = d.getMinutes(), hourKey = d.getHours() + (min >= 58 ? 1 : 0)
  const idDue = p.live && (min >= 58 || min <= 2) && idDone !== hourKey

  return (
    <div className="hw-screen h-full flex flex-col px-9 py-7">
      <p className="hw-title text-5xl leading-[1.35] truncate -mt-1">{p.show?.title ?? 'No show booked'}</p>
      <p className={`lbl text-2xl ${red ? 'warn' : ''}`}>{label}{sub ? ` · ${sub}` : ''}</p>
      <p className={`num ${red ? 'warn' : ''}`} style={{ fontSize: 'clamp(6rem, 11vw, 15rem)' }}>{value}</p>
      <div className="mt-auto grid grid-cols-3 border-t rule">
        <Readout label={!ad ? 'Ad breaks' : ad.now ? 'Ad break · back in' : 'Next ad break'} value={!ad ? 'Off' : mmss(((ad.now ? ad.end : ad.start) - now) / 1000)} warn={adSoon} />
        <Readout label="Talking" value={p.live ? mmss(talking) : '–'} warn={talking >= TALK_LONG_S} />
        <Readout label="On air" value={p.live ? mmss(p.onAirSeconds) : 'Off'} />
      </div>
      {(idDue || p.next) && (
        <div className="pt-3 flex items-center gap-4 text-xl">
          {idDue ? (
            <>
              <span className="ok">Station ID: “You’re listening to Babson Radio.”</span>
              <button type="button" className="gbtn h-11 px-4 text-lg ml-auto" onClick={() => { p.onPlayId(); setIdDone(hourKey) }}>Play ID</button>
              <button type="button" className="gbtn h-11 px-4 text-lg" onClick={() => setIdDone(hourKey)}>Done</button>
            </>
          ) : p.next && (
            <span className="lbl">Next on air: {p.next.title}{p.next.hosts.length ? ` with ${p.next.hosts.join(', ')}` : ''} at {clock(p.next.startAt)}</span>
          )}
        </div>
      )}
    </div>
  )
}

function Readout({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="pt-3 pr-6">
      <p className={`lbl text-xl ${warn ? 'warn' : ''}`}>{label}</p>
      <p className={`num text-6xl ${warn ? 'warn' : ''}`}>{value}</p>
    </div>
  )
}
