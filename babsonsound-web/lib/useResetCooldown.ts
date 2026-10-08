import { useEffect, useState } from 'react'
import { resetSecondsLeft } from '@/lib/auth'

/** Seconds left before another reset email can be sent to this address; ticks once a second. */
export function useResetCooldown(email: string, bump: number): number {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    const tick = () => setLeft(resetSecondsLeft(email))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [email, bump])
  return left
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
