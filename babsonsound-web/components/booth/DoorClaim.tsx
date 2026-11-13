'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { signInWithCustomToken } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { claimDoorPing } from '@/lib/booth'
import { attestHeaders, boothFetch } from './helper'

/** Door QR: someone scanned the code. A new scan is claimed right away, and so is the last one if it is under 60 seconds old when the panel opens (a scan while it was closed); the PC says who
 *  is being signed in for 4 seconds (Cancel works), then signs in with the one-time token. Used on the idle screen and on the no-sign-in booth. */
export default function DoorClaim() {
  const [door, setDoor] = useState<{ firstName: string; token: string; left: number } | null>(null)
  useEffect(() => {
    let first = true, last = ''
    return onSnapshot(doc(db, 'boothDoorPing', 'latest'), snap => {
      const claimId = String(snap.get('claimId') ?? '')
      const isFirst = first
      first = false
      if (!claimDoorPing({ first: isFirst, claimId, lastId: last, at: Number(snap.get('at') ?? 0), now: Date.now() })) { if (isFirst) last = claimId; return }
      last = claimId
      void (async () => {
        try {
          const h = await attestHeaders()
          const r = await boothFetch<{ customToken: string; firstName: string }>('/api/booth/door-claim', { claimId, nonce: h['x-booth-nonce'], sig: h['x-booth-sig'] })
          setDoor({ firstName: r.firstName, token: r.customToken, left: 4 })
        } catch { /* expired or not for this PC */ }
      })()
    }, () => {})
  }, [])
  useEffect(() => {
    if (!door) return
    if (door.left <= 0) { const t = door.token; queueMicrotask(() => setDoor(null)); signInWithCustomToken(auth, t).catch(() => {}); return }
    const t = setTimeout(() => setDoor(d => (d ? { ...d, left: d.left - 1 } : d)), 1000)
    return () => clearTimeout(t)
  }, [door])
  if (!door) return null
  return (
    <div className="fixed inset-0 z-[96] grid place-items-center bg-black/85" role="alertdialog" aria-label="Signing in">
      <div className="hw-screen p-12 text-center space-y-6">
        <p className="hw-title text-7xl">Hello {door.firstName}</p>
        <p className="text-3xl lbl">Signing you in…</p>
        <button type="button" className="gbtn h-16 px-10 text-2xl" onClick={() => setDoor(null)}>Not me, cancel</button>
      </div>
    </div>
  )
}
