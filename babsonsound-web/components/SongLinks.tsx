'use client'

/** "Find this song" links. Plain search links, so there is no account or key to manage and nothing to go stale. */
export default function SongLinks({ title, artist, className = '' }: { title: string; artist?: string; className?: string }) {
  if (!title) return null
  const q = encodeURIComponent([title, artist].filter(Boolean).join(' '))
  const a = 'underline underline-offset-2 hover:text-br-gold'
  return (
    <p className={`text-xs text-br-dk-sub ${className}`}>
      Find it:{' '}
      <a className={a} href={`https://music.apple.com/us/search?term=${q}`} target="_blank" rel="noopener noreferrer">Apple Music</a>
      {' · '}
      <a className={a} href={`https://open.spotify.com/search/${q}`} target="_blank" rel="noopener noreferrer">Spotify</a>
    </p>
  )
}
