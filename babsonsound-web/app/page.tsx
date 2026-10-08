import LivePlayer from '@/components/LivePlayer'
import EpisodeCard from '@/components/EpisodeCard'
import { LikesProvider, LikeBar } from '@/components/Likes'
import Link from 'next/link'
import { LINKS } from '@/lib/links'
import ShareFormButton from '@/components/ShareFormButton'
import InterestFormCta from '@/components/InterestFormCta'
import VoteCard from '@/components/VoteCard'
import LiveExtrasPane from '@/components/LiveExtrasPane'
import ArtTheme from '@/components/ArtTheme'
import RecentlyPlayed from '@/components/RecentlyPlayed'
import { getRecentEpisodes, getTodaySchedule, getFeaturedShows } from '@/lib/firestore'

export const revalidate = 60 // re-fetch data every 60 seconds

export default async function HomePage() {
  const [episodes, schedule, shows] = await Promise.all([
    getRecentEpisodes(8),
    getTodaySchedule(),
    getFeaturedShows(),
  ])

  return (
    <ArtTheme className="max-w-6xl lg:max-w-[1800px] mx-auto px-4 lg:px-8 xl:px-12 py-8 space-y-16">

      {/* ── Interest form (hidden for signed-in members) ───────── */}
      <InterestFormCta><section className="sk-raised rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex-1">
          <h2 className="font-display text-br-dk-text text-2xl tracking-wide">TELL US WHAT YOU WANT TO HEAR</h2>
          <p className="text-sm text-br-dk-sub mt-1">Music, podcasts, sports highlights. The interest form takes under a minute.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 shrink-0">
          <a href={LINKS.interest} target="_blank" rel="noopener noreferrer"
             className="sk-btn font-display tracking-[0.2em] text-sm px-6 py-3.5 rounded-xl text-center">
            FILL OUT THE FORM
          </a>
          <ShareFormButton className="text-center" />
        </div>
      </section></InterestFormCta>

      {/* Two panes on desktop: the player stays on the left, everything else scrolls on the right. */}
      <div className="lg:grid lg:grid-cols-[minmax(400px,34%)_minmax(0,1fr)] lg:gap-10 xl:gap-14 lg:items-start space-y-16 lg:space-y-0">
      <div className="lg:[@media(min-height:860px)]:sticky lg:top-24">
        <section>
          <LivePlayer pane />
        </section>
        <div className="hidden lg:block"><RecentlyPlayed /></div>
      </div>
      <div className="space-y-16 min-w-0">
        <div className="space-y-6 empty:hidden">
          <LiveExtrasPane />
          <VoteCard />
        </div>

      {/* ── Today's Schedule ─────────────────────────────────── */}
      {schedule.length > 0 && (
        <section>
          <SectionHeader title="TODAY'S SCHEDULE" />
          <div className="rounded-xl overflow-hidden sk-raised divide-y divide-br-dk-border">
            {schedule.map((slot: any) => (
              <div key={slot.id} className={`flex items-center gap-4 px-5 py-4 ${slot.isLive ? 'bg-br-green/5' : 'bg-br-dk-surface'}`}>
                <span className={`font-display text-sm tracking-wider w-20 shrink-0 ${slot.isLive ? 'text-br-gold' : 'text-br-dk-sub'}`}>
                  {slot.startTime}
                </span>
                {slot.isLive && <span className="w-2 h-2 rounded-full bg-br-red shrink-0" />}
                <div>
                  <p className={`text-sm font-medium ${slot.isLive ? 'text-br-dk-text' : 'text-br-dk-sub'}`}>
                    {slot.showName}
                  </p>
                  {slot.hostNames?.length > 0 && (
                    <p className="text-br-dk-muted text-xs">{slot.hostNames.join(', ')}</p>
                  )}
                </div>
                {slot.isLive && (
                  <div className="ml-auto flex items-center gap-1.5 bg-br-red/20 border border-br-red/30 px-2.5 py-1 rounded">
                    <span className="w-1 h-1 rounded-full bg-br-red" />
                    <span className="font-display text-br-red text-[10px] tracking-widest">LIVE</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Recent Episodes ───────────────────────────────────── */}
      {episodes.length > 0 && (
        <section>
          <SectionHeader title="RECENT EPISODES" href="/browse" />
          <LikesProvider ids={episodes.slice(0, 8).map((ep: any) => ep.id)}>
            <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-5">
              {episodes.slice(0, 8).map((ep: any) => (
                <div key={ep.id}>
                  <EpisodeCard episode={ep} />
                  <LikeBar episodeId={ep.id} />
                </div>
              ))}
            </div>
          </LikesProvider>
        </section>
      )}

      {/* ── Featured Shows ────────────────────────────────────── */}
      {shows.length > 0 && (
        <section>
          <SectionHeader title="SHOWS" href="/shows" />
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4">
            {shows.map((show: any) => (
              <Link
                key={show.id}
                href={`/shows/${show.slug}`}
                className="group flex items-center gap-4 p-4 rounded-xl sk-raised"
              >
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[#003D27] to-br-green flex items-center justify-center shrink-0 overflow-hidden">
                  {show.artworkURL
                    ? <img src={show.artworkURL} alt={show.name} className="w-full h-full object-cover" />
                    : <span className="font-display text-br-brass text-xl">{show.name[0]}</span>
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-br-dk-text text-sm font-medium truncate group-hover:text-br-gold transition-colors">
                    {show.name}
                  </p>
                  <p className="text-br-dk-sub text-xs truncate">{show.description}</p>
                  <p className="text-br-dk-muted text-xs">{show.totalEpisodes ?? 0} episodes</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      </div>
      </div>

      {/* Request a spot: a button here and one in the profile, instead of a tab in the nav */}
      <section className="sk-raised rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex-1">
          <h2 className="font-display text-br-dk-text text-2xl tracking-wide">WANT YOUR OWN SHOW?</h2>
          <p className="text-sm text-br-dk-sub mt-1">Pick a time and tell us what you would play. Students can request an hour on air.</p>
        </div>
        <Link href="/slots" className="sk-btn font-display tracking-[0.2em] text-sm px-6 py-3.5 rounded-xl text-center shrink-0">REQUEST A SPOT</Link>
      </section>

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

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <h2 className="font-display text-br-dk-text text-xl tracking-[0.1em] shrink-0">{title}</h2>
      <div className="flex-1 h-px bg-br-dk-border" />
      {href && (
        <Link href={href} className="font-display text-br-gold text-xs tracking-widest hover:text-br-gold/80 shrink-0">
          SEE ALL
        </Link>
      )}
    </div>
  )
}
