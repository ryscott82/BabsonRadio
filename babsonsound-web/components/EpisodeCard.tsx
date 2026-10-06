import Link from 'next/link'
import Image from 'next/image'

interface Episode {
  id: string
  title: string
  showName: string
  showSlug: string
  duration: number      // seconds
  publishedAt: { seconds: number } | Date | string
  thumbnailURL?: string
  youtubeID?: string
  isNew?: boolean
  episodeNumber?: number
  semester?: string
  category?: string
}

interface EpisodeCardProps {
  episode: Episode
  layout?: 'row' | 'card'
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m} min`
}

function formatDate(ts: { seconds: number } | Date | string) {
  const date = typeof ts === 'string'
    ? new Date(ts)
    : ts instanceof Date
    ? ts
    : new Date((ts as { seconds: number }).seconds * 1000)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const categoryGradients: Record<string, string> = {
  Music:     'from-[#003D27] to-[#006644]',
  Interview: 'from-[#1A2E4A] to-[#2E5C8A]',
  Podcast:   'from-[#2A1A08] to-[#5C3A10]',
  Talk:      'from-[#1A0A2E] to-[#4A1A7A]',
  News:      'from-[#2A0808] to-[#7A1A1A]',
}

export default function EpisodeCard({ episode, layout = 'card' }: EpisodeCardProps) {
  const gradient = categoryGradients[episode.category ?? ''] ?? 'from-[#003D27] to-[#006644]'

  const thumbnail = episode.thumbnailURL ? (
    <Image
      src={episode.thumbnailURL}
      alt={episode.title}
      fill
      className="object-cover"
    />
  ) : (
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
      {episode.episodeNumber && (
        <div className="text-center">
          <p className="font-display text-br-gold/60 text-[10px] tracking-[0.3em]">EP</p>
          <p className="font-display text-br-gold text-3xl">{episode.episodeNumber}</p>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 h-px bg-br-gold/40" />
    </div>
  )

  if (layout === 'row') {
    return (
      <Link
        href={`/shows/${episode.showSlug}#${episode.id}`}
        className="flex items-center gap-4 p-4 rounded-xl bg-br-dk-surface border border-br-dk-border hover:border-br-dk-border2 transition-colors group"
      >
        <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden">
          {thumbnail}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {episode.isNew && (
              <span className="font-display text-[9px] tracking-widest bg-br-gold text-br-dk-bg px-2 py-0.5 rounded">NEW</span>
            )}
            {episode.category && (
              <span className="font-display text-[9px] tracking-widest text-br-dk-muted">{episode.category.toUpperCase()}</span>
            )}
          </div>
          <p className="text-br-dk-text text-sm font-medium truncate group-hover:text-br-gold transition-colors">
            {episode.title}
          </p>
          <p className="text-br-dk-sub text-xs">{episode.showName}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-br-dk-muted text-xs">{formatDuration(episode.duration)}</p>
          <p className="text-br-dk-muted text-xs">{formatDate(episode.publishedAt)}</p>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={`/shows/${episode.showSlug}#${episode.id}`}
      className="group block"
    >
      <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3">
        {thumbnail}
      </div>
      <div>
        {episode.isNew && (
          <span className="font-display text-[9px] tracking-widest bg-br-gold text-br-dk-bg px-2 py-0.5 rounded mr-2">NEW</span>
        )}
        <p className="text-br-dk-text text-sm font-medium mt-2 line-clamp-2 group-hover:text-br-gold transition-colors">
          {episode.title}
        </p>
        <p className="text-br-dk-sub text-xs mt-0.5">{episode.showName}</p>
        <p className="text-br-dk-muted text-xs">{formatDuration(episode.duration)}</p>
      </div>
    </Link>
  )
}
