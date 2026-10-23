import LivePlayer from '@/components/LivePlayer'
import EpisodeCard from '@/components/EpisodeCard'
type EpisodeProps = React.ComponentProps<typeof EpisodeCard>['episode']
import { LikesProvider, LikeBar } from '@/components/Likes'
import Link from 'next/link'
import VoteCard from '@/components/VoteCard'
import LiveShell from '@/components/LiveShell'
import AutoUpcoming from '@/components/AutoUpcoming'
import ArtTheme from '@/components/ArtTheme'
import { getRecentEpisodes, getTodaySchedule } from '@/lib/firestore'

export const revalidate = 60 // re-fetch data every 60 seconds

export default async function HomePage() {
  const [episodes, schedule] = await Promise.all([
    getRecentEpisodes(8),
    getTodaySchedule(),
  ])

  return (
    <ArtTheme className="max-w-[1340px] mx-auto px-4 lg:px-10 py-10 space-y-10 hw-stage">

      <LiveShell>
        {/* Cover and amp */}
        <LivePlayer pane />

        {/* Schedule and the music vote (with ratings) */}
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-14 items-stretch lg:[&>*:last-child]:self-start">
          <section className="hw-panel hw-big">
            <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-br-dk-border">
              <h2 className="hw-title !whitespace-normal text-[1.53rem]">On the air today</h2>
              <Link href="/schedule" className="text-sm font-semibold text-br-gold underline underline-offset-4">See the week</Link>
            </div>
            {schedule.length > 0 ? (
              <ul className="divide-y divide-br-dk-border">
                {schedule.map(slot => (
                  <li key={slot.id} className="flex items-center gap-4 py-4">
                    <span className="w-14 shrink-0 font-bold text-br-gold text-sm tabular-nums">{slot.startTime}</span>
                    {slot.isLive ? <span aria-hidden className="w-2 h-2 rounded-full bg-br-red shrink-0" /> : <span aria-hidden className="w-2 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[19px] font-semibold text-br-dk-text truncate">{slot.showName}</p>
                      {slot.hostNames?.length > 0 && <p className="text-xs hw-sub truncate">{slot.hostNames.join(' and ')}</p>}
                    </div>
                    {slot.isLive
                      ? <span className="font-display text-br-red text-[14px] tracking-[0.2em]">Live</span>
                      : <Link href="/schedule" className="sk-key hw-pill inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-semibold shrink-0">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0" /></svg>
                          Remind me
                        </Link>}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="text-sm hw-sub pt-5 pb-1">No live shows today. The auto DJ has you covered:</p>
                <AutoUpcoming />
              </>
            )}
          </section>
          <VoteCard />
        </div>
      </LiveShell>

      {/* Library picks */}
      <section className="hw-panel hw-big">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="hw-title !whitespace-normal text-[1.53rem]">You might like...</h2>
            <p className="text-sm hw-sub">Based on what you saved and liked.</p>
          </div>
          <Link href="/library" className="text-sm font-semibold text-br-gold underline underline-offset-4">Browse the library</Link>
        </div>
        {episodes.length > 0 ? (
          <LikesProvider ids={episodes.slice(0, 6).map(ep => ep.id)}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8 mt-6">
              {episodes.slice(0, 6).map(ep => (
                <div key={ep.id}><EpisodeCard episode={ep as EpisodeProps} layout="wide" /><LikeBar episodeId={ep.id} /></div>
              ))}
            </div>
          </LikesProvider>
        ) : (
          <p className="text-sm hw-sub py-6">No episodes yet. Replays and podcasts will show up here.</p>
        )}
      </section>
    </ArtTheme>
  )
}
