import { getShowBySlug, getEpisodesByShow } from '@/lib/firestore'
import EpisodeCard from '@/components/EpisodeCard'
type EpisodeProps = React.ComponentProps<typeof EpisodeCard>['episode']
import { LikesProvider, LikeBar } from '@/components/Likes'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const revalidate = 120

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const show = await getShowBySlug(slug)
  if (!show) return { title: 'Show not found' }
  return {
    title: `${show.name} — Babson Radio`,
    description: show.description,
  }
}

export default async function ShowPage({ params }: Props) {
  const { slug } = await params
  const show = await getShowBySlug(slug)
  const episodes = show ? await getEpisodesByShow(show.id) : []

  if (!show) notFound()

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Show header */}
      <div className="flex flex-col sm:flex-row items-start gap-6 mb-12">
        {/* Artwork */}
        <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-[#003D27] to-br-green shrink-0 flex items-center justify-center">
          {show.artworkURL
            ? <img src={show.artworkURL} alt={show.name} className="w-full h-full object-cover" />
            : <span className="font-display text-br-gold text-6xl">{show.name[0]}</span>
          }
        </div>

        {/* Meta */}
        <div className="flex-1">
          <p className="font-display text-br-gold text-sm tracking-widest mb-2">{show.category}</p>
          <h1 className="font-display text-br-dk-text text-4xl md:text-5xl tracking-wide mb-3">{show.name}</h1>
          {show.hostNames?.length > 0 && (
            <p className="text-br-dk-sub text-sm mb-3">{show.hostNames.join(' · ')}</p>
          )}
          <p className="text-br-dk-sub text-sm max-w-xl mb-4">{show.longDescription || show.description}</p>

          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-br-dk-muted text-sm">{episodes.length} episodes</span>

            {/* RSS link */}
            <a
              href={`/api/rss/${show.slug}`}
              className="flex items-center gap-1.5 text-br-gold text-sm font-display tracking-widest hover:text-br-gold/80"
              target="_blank"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.18 15.64a2.18 2.18 0 012.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 012.18-2.18M4 4.44A15.56 15.56 0 0119.56 20h-2.83A12.73 12.73 0 004 7.27V4.44m0 5.66a9.9 9.9 0 019.9 9.9h-2.83A7.07 7.07 0 004 12.93V10.1z"/>
              </svg>
              RSS Feed
            </a>
          </div>
        </div>
      </div>

      {/* Episodes */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="font-display text-br-dk-text text-xl tracking-[0.1em] shrink-0">Episodes</h2>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>

      {episodes.length === 0 ? (
        <p className="text-br-dk-muted text-sm py-12 text-center">No episodes published yet.</p>
      ) : (
        <LikesProvider ids={episodes.map(ep => ep.id)}>
          <div className="space-y-3">
            {episodes.map(ep => (
              <div key={ep.id}>
                <EpisodeCard episode={ep as EpisodeProps} layout="row" />
                <LikeBar episodeId={ep.id} />
              </div>
            ))}
          </div>
        </LikesProvider>
      )}
    </div>
  )
}
