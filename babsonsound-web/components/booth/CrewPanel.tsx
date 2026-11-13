'use client'

import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { signInWithCustomToken } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { hostsWith, type CrewPerson } from '@/lib/crew'
import { attestHeaders, boothFetch, helper } from './helper'
import type { Show } from './ShowInfo'

/** The studio crew, on the studio PC while someone is signed in. Other people who scan the door code join the crew (named on screen, added to the show's
 *  hosts); a crew member can take over with "Take control" (not while on air or recording). Takes the crew from each check-in (crew prop). */
export default function CrewPanel({ crew, driverName, onAir, getToken }: { crew: CrewPerson[]; driverName: string; onAir: boolean; getToken: () => Promise<string> }) {
  const [list, setList] = useState<CrewPerson[]>(crew)
  const [toast, setToast] = useState('')
  const [pick, setPick] = useState<CrewPerson | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [seen, setSeen] = useState(crew)
  if (seen !== crew) { setSeen(crew); setList(crew) }

  const addHost = useCallback(async (name: string) => {
    try {
      const tk = await getToken()
      const s = await helper<Show>('/show/get', { token: tk })
      const hosts = hostsWith(s.hosts ?? [], driverName, name)
      if (hosts.length !== (s.hosts ?? []).length) await helper('/show/set', { token: tk, title: s.title, hosts, description: s.description, category: s.category })
    } catch { /* the host list can still be edited by hand in Show info */ }
  }, [getToken, driverName])

  useEffect(() => {
    let first = true, last = ''
    return onSnapshot(doc(db, 'boothDoorPing', 'latest'), snap => {
      const claimId = String(snap.get('claimId') ?? '')
      if (first) { first = false; last = claimId; return }
      if (!claimId || claimId === last) return
      last = claimId
      void (async () => {
        try {
          const h = await attestHeaders()
          const r = await boothFetch<{ crew?: boolean; firstName: string; name: string; members: CrewPerson[] }>('/api/booth/door-claim', { claimId, nonce: h['x-booth-nonce'], sig: h['x-booth-sig'] })
          if (!r.crew) return
          setList(r.members); setToast(`${r.firstName} joined the studio`)
          void addHost(r.name || r.firstName)
        } catch { /* expired or not for this PC */ }
      })()
    }, () => {})
  }, [addHost])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) }, [toast])

  const takeOver = async () => {
    if (!pick) return
    setBusy(true); setErr('')
    try {
      const h = await attestHeaders()
      const r = await boothFetch<{ customToken: string }>('/api/booth/takeover', { uid: pick.uid, nonce: h['x-booth-nonce'], sig: h['x-booth-sig'] })
      await signInWithCustomToken(auth, r.customToken)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); setBusy(false) }
  }

  if (!list.length && !toast) return null
  return (
    <>
      {toast && <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[95] hw-screen px-8 py-4 text-3xl" role="status">{toast}</div>}
      {list.length > 0 && (
        <ul className="flex items-center gap-2 flex-wrap" aria-label="Also in the studio">
          {list.map(p => (
            <li key={p.uid} className="flex items-center gap-2 rounded-full pl-4 pr-1.5 py-1 text-xl" style={{ background: 'rgba(0,0,0,.35)', boxShadow: 'inset 0 0 0 1px rgba(244,239,226,.25)' }}>
              <span>{p.firstName || p.name}</span>
              <button type="button" className="gbtn h-9 px-3 text-sm" disabled={onAir} title={onAir ? 'Take control opens when the show ends.' : `Take control as ${p.firstName || p.name}`} onClick={() => { setErr(''); setPick(p) }}>Take control</button>
            </li>
          ))}
        </ul>
      )}
      {pick && (
        <div className="fixed inset-0 z-[96] grid place-items-center bg-black/85" role="alertdialog" aria-label="Take control">
          <div className="hw-screen p-10 text-center space-y-5 max-w-xl">
            <p className="hw-title text-5xl">Take control as {pick.firstName || pick.name}?</p>
            <p className="text-xl opacity-80">{driverName} stays in the studio.</p>
            {err && <p className="text-lg text-red-300">{err}</p>}
            <div className="flex gap-4 justify-center">
              <button type="button" className="gbtn h-16 px-10 text-2xl" onClick={() => setPick(null)} disabled={busy}>Cancel</button>
              <button type="button" className="gbtn gbtn-go h-16 px-10 text-2xl" onClick={() => void takeOver()} disabled={busy}>Take control</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
