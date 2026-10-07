import Link from 'next/link'
import { getShows } from '@/lib/firestore'

export const revalidate = 120

export default async function ShowsPage() {
  const shows = await getShows()

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-10">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">ALL SHOWS</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <span className="font-display text-br-dk-muted text-xs tracking-widest">{shows.length} SHOWS</span>
      </div>

      {shows.length === 0 ? (
        <div className="text-center py-32 text-br-dk-muted">
          <p className="font-display text-2xl tracking-widest mb-2">NO SHOWS YET</p>
          <p className="text-sm">Shows will appear here once published by an admin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {shows.map((show: any) => (
            <Link
              key={show.id}
              href={`/shows/${show.slug}`}
              className="group sk-raised rounded-2xl overflow-hidden"
            >
              {/* Artwork */}
              <div className="relative w-full aspect-square bg-gradient-to-br from-[#003D27] to-br-green overflow-hidden">
                {show.artworkURL ? (
                  <img src={show.artworkURL} alt={show.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-br-brass text-6xl tracking-wider">{show.name[0]}</span>
                  </div>
                )}
                {show.isFeatured && (
                  <div className="absolute top-3 left-3 font-display text-[9px] tracking-widest bg-br-red text-white px-2 py-0.5 rounded">
                    FEATURED
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="font-display text-br-dk-sub text-[10px] tracking-widest mb-1">
                  {show.category?.toUpperCase()}
                </p>
                <h3 className="text-br-dk-text font-semibold text-base group-hover:text-br-gold transition-colors mb-1">
                  {show.name}
                </h3>
                <p className="text-br-dk-sub text-xs line-clamp-2 mb-3">{show.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-br-dk-muted text-xs">{show.totalEpisodes ?? 0} episodes</span>
                  {show.hostNames?.length > 0 && (
                    <span className="text-br-dk-muted text-xs truncate ml-4">
                      {show.hostNames.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
