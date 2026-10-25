'use client'

/** "Find this song" links. Plain search links, so there is no account or key to manage and nothing to go stale. */
export default function SongLinks({ title, artist, className = '', keys = false }: { title: string; artist?: string; className?: string; keys?: boolean }) {
  if (!title) return null
  const q = encodeURIComponent([title, artist].filter(Boolean).join(' '))
  if (keys) {
    const k = 'sk-key hw-pill inline-flex items-center justify-center h-8 px-5 rounded-full text-sm font-semibold'
    return (
      <div className={`flex justify-center gap-3 ${className}`}>
        <a className={k} href={`https://music.apple.com/us/search?term=${q}`} target="_blank" rel="noopener noreferrer">Apple Music</a>
        <a className={k} href={`https://open.spotify.com/search/${q}`} target="_blank" rel="noopener noreferrer">Spotify</a>
      </div>
    )
  }
  const a = 'underline underline-offset-2 hover:text-br-gold'
  return (
    <p className={`text-sm text-br-dk-sub ${className}`}>
      Find it:{' '}
      <a className={a} href={`https://music.apple.com/us/search?term=${q}`} target="_blank" rel="noopener noreferrer">Apple Music</a>
      {' · '}
      <a className={a} href={`https://open.spotify.com/search/${q}`} target="_blank" rel="noopener noreferrer">Spotify</a>
    </p>
  )
}
