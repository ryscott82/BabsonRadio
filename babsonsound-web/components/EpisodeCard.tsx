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
  layout?: 'row' | 'card' | 'wide'
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
  Interview: 'from-[#00402B] to-[#0B7A55]',
  Podcast:   'from-[#0A3322] to-[#14704D]',
  Talk:      'from-[#06301F] to-[#0F6B48]',
  News:      'from-[#0F2E22] to-[#1F7A58]',
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
          <p className="font-display text-br-brass/60 text-[13px] tracking-[0.3em]">Ep</p>
          <p className="font-display text-br-brass text-3xl">{episode.episodeNumber}</p>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 h-px bg-br-brass/40" />
    </div>
  )

  if (layout === 'wide') {
    return (
      <Link href={`/shows/${episode.showSlug}#${episode.id}`} className="group block">
        <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-[0_8px_14px_rgba(24,16,8,.35)]">
          {thumbnail}
          <span aria-hidden className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#f4efe2]/95 text-[#1a1710] flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
            <svg className="w-3.5 h-3.5 translate-x-px" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <svg aria-hidden className="absolute bottom-3 left-4 w-7 h-7 text-white/85" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" viewBox="0 0 24 24">
            {episode.category === 'Music' || /replay/i.test(episode.category ?? '')
              ? <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4" />
              : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>}
          </svg>
          <span className="absolute bottom-3 right-3 text-[14px] px-2 py-0.5 rounded-md bg-black/55 text-white tabular-nums">{formatDuration(episode.duration)}</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-br-dk-text truncate group-hover:text-br-gold transition-colors">
          {episode.isNew && <span className="font-display text-[12px] tracking-widest bg-br-red text-white px-1.5 py-0.5 rounded mr-2 align-middle">New</span>}
          {episode.title}
        </p>
        <p className="text-xs hw-sub truncate">{episode.category ? `${episode.category} · ` : ''}{episode.showName}</p>
      </Link>
    )
  }

  if (layout === 'row') {
    return (
      <Link
        href={`/shows/${episode.showSlug}#${episode.id}`}
        className="flex items-center gap-4 p-4 rounded-xl sk-raised group"
      >
        <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden">
          {thumbnail}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {episode.isNew && (
              <span className="font-display text-[12px] tracking-widest bg-br-red text-white px-2 py-0.5 rounded">New</span>
            )}
            {episode.category && (
              <span className="font-display text-[12px] tracking-widest text-br-dk-muted">{episode.category.toUpperCase()}</span>
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
          <span className="font-display text-[12px] tracking-widest bg-br-red text-white px-2 py-0.5 rounded mr-2">New</span>
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
