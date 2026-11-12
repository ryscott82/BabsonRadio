import { getShows } from '@/lib/firestore'
import ShowsGrid, { type ShowCard } from '@/components/ShowsGrid'
import LibraryEpisodes from '@/components/LibraryEpisodes'
import HostShowCard from '@/components/HostShowCard'

export const revalidate = 120

// One Library: Shows (public) and Episodes (students). /shows sends people here (next.config.ts), /shows/<name> pages are unchanged.
export default async function LibraryPage() {
  const shows = await getShows()
  return (
    <div className="max-w-[1800px] w-full mx-auto px-4 lg:px-8 py-6 space-y-10">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Library</h1>
      <nav aria-label="Library sections" className="flex gap-4 text-base -mt-6">
        <a href="#shows" className="text-br-gold underline underline-offset-4">Shows</a>
        <a href="#episodes" className="text-br-gold underline underline-offset-4">Episodes</a>
      </nav>
      <section id="shows" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-br-dk-text text-2xl tracking-[0.06em] shrink-0">Shows</h2>
          <div className="flex-1 h-px bg-br-dk-border" />
          <span className="font-display text-br-dk-muted text-base tracking-widest">{shows.length} {shows.length === 1 ? 'show' : 'shows'}</span>
        </div>
        <ShowsGrid shows={shows as unknown as ShowCard[]} />
      </section>
      <section id="episodes" className="space-y-4 scroll-mt-24 max-w-3xl">
        <h2 className="font-display text-br-dk-text text-2xl tracking-[0.06em]">Episodes</h2>
        <LibraryEpisodes />
      </section>
      <div className="max-w-3xl"><HostShowCard note="Want your own show in this list? Request a time and send." /></div>
    </div>
  )
}
