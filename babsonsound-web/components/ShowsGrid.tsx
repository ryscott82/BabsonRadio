import Link from 'next/link'

export interface ShowCard {
  id: string; slug: string; name: string; category?: string; description?: string; artworkURL?: string
  isFeatured?: boolean; totalEpisodes?: number; hostNames?: string[]
}

/** The Shows section of the Library (it used to be the Shows page). Public. */
export default function ShowsGrid({ shows }: { shows: ShowCard[] }) {
  if (shows.length === 0) {
    return <p className="text-base text-br-dk-sub">No shows yet. New shows will show up here as they are added.</p>
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 content-start">
      {shows.map(show => (
        <Link key={show.id} href={`/shows/${show.slug}`} className="group sk-raised rounded-2xl overflow-hidden">
          <div className="relative w-full aspect-square sk-field overflow-hidden">
            {show.artworkURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={show.artworkURL} alt={show.name} className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display text-br-dk-sub text-6xl tracking-wider">{show.name[0]}</span>
              </div>
            )}
            {show.isFeatured && (
              <div className="absolute top-3 left-3 font-display text-base tracking-widest bg-br-red text-white px-2 py-0.5 rounded">Featured</div>
            )}
          </div>
          <div className="p-4">
            <p className="text-br-dk-sub text-base mb-1">{show.category}</p>
            <h3 className="text-br-dk-text font-semibold text-lg group-hover:text-br-gold transition-colors mb-1">{show.name}</h3>
            <p className="text-br-dk-sub text-base line-clamp-2 mb-3">{show.description}</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-br-dk-muted text-base">{show.totalEpisodes ?? 0} episodes</span>
              {(show.hostNames?.length ?? 0) > 0 && <span className="text-br-dk-muted text-base truncate">{show.hostNames!.join(', ')}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
