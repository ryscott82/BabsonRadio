'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type State = 'working' | 'done' | 'error'

// No login. The link in the email carries a token; we hand it to the server and report the result.
export default function Unsubscribe() {
  const token = useSearchParams().get('t') ?? ''
  const [state, setState] = useState<State>(token ? 'working' : 'error')

  useEffect(() => {
    if (!token) return
    let stop = false
    fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`)
      .then(r => { if (!stop) setState(r.ok ? 'done' : 'error') })
      .catch(() => { if (!stop) setState('error') })
    return () => { stop = true }
  }, [token])

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4 text-center">
      <p role="status" className={`font-display text-xl sm:text-2xl ${state === 'error' ? 'text-br-red' : 'text-br-dk-text'}`}>
        {state === 'working' ? 'One moment…' : state === 'done' ? "You're unsubscribed. We won't email you again." : "That link didn't work."}
      </p>
    </div>
  )
}
