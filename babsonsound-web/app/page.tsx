import LivePlayer from '@/components/LivePlayer'
import EpisodeCard from '@/components/EpisodeCard'
type EpisodeProps = React.ComponentProps<typeof EpisodeCard>['episode']
import { LikesProvider, LikeBar } from '@/components/Likes'
import Link from 'next/link'
import { LINKS } from '@/lib/links'
import InterestFormCta from '@/components/InterestFormCta'
import VoteCard from '@/components/VoteCard'
import LiveExtrasPane from '@/components/LiveExtrasPane'
import HomeTabs from '@/components/HomeTabs'
import ArtTheme from '@/components/ArtTheme'
import { getRecentEpisodes, getTodaySchedule, getFeaturedShows } from '@/lib/firestore'

export const revalidate = 60 // re-fetch data every 60 seconds

export default async function HomePage() {
  const [episodes, schedule, shows] = await Promise.all([
    getRecentEpisodes(8),
    getTodaySchedule(),
    getFeaturedShows(),
  ])

  const todayPanel = schedule.length > 0 ? (
    <div className="rounded-xl overflow-hidden sk-raised divide-y divide-br-dk-border">
      {schedule.map(slot => (
        <div key={slot.id} className={`flex items-center gap-4 px-5 py-3 ${slot.isLive ? 'bg-br-green/5' : 'bg-br-dk-surface'}`}>
          <span className={`font-display text-sm tracking-wider w-20 shrink-0 ${slot.isLive ? 'text-br-gold' : 'text-br-dk-sub'}`}>{slot.startTime}</span>
          {slot.isLive && <span className="w-2 h-2 rounded-full bg-br-red shrink-0" />}
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${slot.isLive ? 'text-br-dk-text' : 'text-br-dk-sub'}`}>{slot.showName}</p>
            {slot.hostNames?.length > 0 && <p className="text-br-dk-muted text-xs truncate">{slot.hostNames.join(', ')}</p>}
          </div>
          {slot.isLive && <span className="ml-auto font-display text-br-red text-[10px] tracking-widest">LIVE</span>}
        </div>
      ))}
    </div>
  ) : <p className="text-sm text-br-dk-sub py-6">Nothing scheduled today. The auto DJ has you covered. <Link href="/schedule" className="text-br-gold">See the week</Link></p>

  const episodesPanel = episodes.length > 0 ? (
    <LikesProvider ids={episodes.slice(0, 6).map(ep => ep.id)}>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {episodes.slice(0, 6).map(ep => (
          <div key={ep.id}><EpisodeCard episode={ep as EpisodeProps} /><LikeBar episodeId={ep.id} /></div>
        ))}
      </div>
    </LikesProvider>
  ) : <p className="text-sm text-br-dk-sub py-6">No episodes yet.</p>

  const showsPanel = shows.length > 0 ? (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {shows.map(show => (
        <Link key={show.id} href={`/shows/${show.slug}`} className="group flex items-center gap-4 p-3 rounded-xl sk-raised">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#003D27] to-br-green flex items-center justify-center shrink-0 overflow-hidden">
            {show.artworkURL ? <img src={show.artworkURL} alt={show.name} className="w-full h-full object-cover" />
              : <span className="font-display text-br-brass text-xl">{show.name[0]}</span>}
          </div>
          <div className="min-w-0">
            <p className="text-br-dk-text text-sm font-medium truncate group-hover:text-br-gold transition-colors">{show.name}</p>
            <p className="text-br-dk-sub text-xs truncate">{show.description}</p>
          </div>
        </Link>
      ))}
    </div>
  ) : <p className="text-sm text-br-dk-sub py-6">No shows yet.</p>

  const tabs = [
    { id: 'today', label: 'TODAY', href: '/schedule', node: todayPanel },
    { id: 'episodes', label: 'EPISODES', href: '/browse', node: episodesPanel },
    { id: 'shows', label: 'SHOWS', href: '/shows', node: showsPanel },
  ]

  return (
    <ArtTheme className="max-w-6xl lg:max-w-[1800px] mx-auto px-4 lg:px-8 xl:px-12 py-6 space-y-10 lg:space-y-4 fit">

      {/* ── Interest form (hidden for signed-in members) ───────── */}
      <InterestFormCta><section className="sk-raised rounded-2xl px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 shrink-0">
        <div className="flex-1">
          <h2 className="font-display text-br-dk-text text-lg tracking-wide">TELL US WHAT YOU WANT TO HEAR</h2>
          <p className="text-xs text-br-dk-sub">Music, podcasts, sports highlights. Under a minute.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 shrink-0">
          <a href={LINKS.interest} target="_blank" rel="noopener noreferrer"
             className="sk-btn font-display tracking-[0.2em] text-xs px-5 py-2.5 rounded-xl text-center">
            FILL OUT THE FORM
          </a>
        </div>
      </section></InterestFormCta>

      {/* Desktop: the player on the left, one panel (Today / Episodes / Shows) on the right. The page never scrolls. */}
      <div className="lg:grid lg:grid-cols-[minmax(440px,46%)_minmax(0,1fr)] lg:gap-8 xl:gap-12 lg:flex-1 lg:min-h-0 space-y-10 lg:space-y-0">
        <div className="lg:h-full lg:min-h-0"><LivePlayer pane /></div>
        <div className="flex flex-col gap-4 min-w-0 lg:h-full lg:min-h-0">
          <div className="space-y-4 empty:hidden shrink-0">
            <LiveExtrasPane />
            <VoteCard />
          </div>
          <div className="lg:flex-1 lg:min-h-0">
            <HomeTabs tabs={tabs} />
          </div>
        </div>
      </div>

      {/* Empty state when no content in Firestore yet */}
      {episodes.length === 0 && shows.length === 0 && schedule.length === 0 && (
        <div className="text-center py-24 text-br-dk-muted">
          <p className="font-display text-2xl tracking-widest mb-2">COMING SOON</p>
          <p className="text-sm">Episodes and shows will appear here once published.</p>
        </div>
      )}
    </ArtTheme>
  )
}
