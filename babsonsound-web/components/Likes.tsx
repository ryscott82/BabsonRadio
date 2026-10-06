'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, apiGet } from '@/lib/auth'
import { useAuth } from '@/contexts/AuthContext'

interface LikesState {
  liked: Set<string>
  friends: Record<string, string[]>
  toggle: (id: string) => void
  enabled: boolean
}

const Ctx = createContext<LikesState>({ liked: new Set(), friends: {}, toggle: () => {}, enabled: false })

/** Wrap a list of episodes: one request loads my likes and which friends liked each. Students only. */
export function LikesProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const { hasMemberAccess } = useAuth()
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const [friends, setFriends] = useState<Record<string, string[]>>({})
  const key = ids.join(',')

  useEffect(() => {
    if (!hasMemberAccess || !key) return
    apiGet<{ liked: string[]; friends: Record<string, string[]> }>(`/api/likes?ids=${encodeURIComponent(key)}`)
      .then(r => { setLiked(new Set(r.liked)); setFriends(r.friends) })
      .catch(() => {})
  }, [hasMemberAccess, key])

  const toggle = useCallback((id: string) => {
    const next = !liked.has(id)
    setLiked(prev => { const s = new Set(prev); if (next) s.add(id); else s.delete(id); return s })
    api('/api/likes', { episodeId: id, liked: next }).catch(() => {
      setLiked(prev => { const s = new Set(prev); if (next) s.delete(id); else s.add(id); return s })
    })
  }, [liked])

  return <Ctx.Provider value={{ liked, friends, toggle, enabled: hasMemberAccess }}>{children}</Ctx.Provider>
}

export function LikeBar({ episodeId }: { episodeId: string }) {
  const { liked, friends, toggle, enabled } = useContext(Ctx)
  if (!enabled) return null
  const isLiked = liked.has(episodeId)
  const names = friends[episodeId] ?? []
  const friendText = names.length === 1 ? `${names[0]} liked this`
    : names.length > 1 ? `${names[0]} and ${names.length - 1} other${names.length > 2 ? 's' : ''} you know liked this` : ''
  return (
    <div className="flex items-center gap-2 mt-1.5 text-xs">
      <button onClick={() => toggle(episodeId)} aria-pressed={isLiked}
              className={isLiked ? 'text-br-gold' : 'text-br-dk-muted hover:text-br-dk-text'}>
        {isLiked ? '♥ Liked' : '♡ Like'}
      </button>
      {friendText && <span className="text-br-dk-sub">{friendText}</span>}
    </div>
  )
}
