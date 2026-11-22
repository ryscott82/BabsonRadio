'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { signInWithCustomToken } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { hostsWith, type CrewPerson } from '@/lib/crew'
import { attestHeaders, boothFetch, helper } from './helper'
import type { Show } from './ShowInfo'

/** The studio crew, on the studio PC while someone is signed in (the In the studio window on the panel). Other people who scan the door code join the crew (named on screen, added to the show's
 *  hosts); a crew member can take over with "Take control" (not while on air or recording). Takes the crew from each check-in (crew prop). */
export default function CrewPanel({ crew, driverName, sessionId, onAir, getToken, onToast }: { crew: CrewPerson[]; driverName: string; sessionId: string; onAir: boolean; getToken: () => Promise<string>; onToast: (text: string) => void }) {
  const [list, setList] = useState<CrewPerson[]>(crew)
  const [pick, setPick] = useState<CrewPerson | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [guests, setGuests] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [gName, setGName] = useState('')
  const [gEmail, setGEmail] = useState('')
  const [gOk, setGOk] = useState(false)
  const [seenSid, setSeenSid] = useState(sessionId)
  if (seenSid !== sessionId) { setSeenSid(sessionId); setGuests([]) }
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
          setList(r.members); onToast(`${r.firstName} joined the studio`)
          void addHost(r.name || r.firstName)
        } catch { /* expired or not for this PC */ }
      })()
    }, () => {})
  }, [addHost, onToast])

  const addGuest = async () => {
    setBusy(true); setErr('')
    try {
      const h = await attestHeaders()
      const r = await boothFetch<{ name: string }>('/api/booth/guest-add', { sessionId, name: gName, email: gEmail, wantsLink: gOk, nonce: h['x-booth-nonce'], sig: h['x-booth-sig'] })
      setGuests(g => [...g, r.name]); onToast(`${r.name} added as a guest`)
      void addHost(gName.trim())
      setAdding(false); setGName(''); setGEmail(''); setGOk(false)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.') }
    setBusy(false)
  }

  const takeOver = async () => {
    if (!pick) return
    setBusy(true); setErr('')
    try {
      const h = await attestHeaders()
      const r = await boothFetch<{ customToken: string }>('/api/booth/takeover', { uid: pick.uid, nonce: h['x-booth-nonce'], sig: h['x-booth-sig'] })
      await signInWithCustomToken(auth, r.customToken)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); setBusy(false) }
  }

  const body = typeof document === 'undefined' ? null : document.body
  return (
    <>
      <div id="hostlist" className="lw row px" aria-label="In the studio">
        <span>{driverName || '…'}</span>
        {list.map(p => (
          <button key={p.uid} type="button" className="px" disabled={onAir} title={onAir ? 'Take control opens when the show ends.' : `Take control as ${p.firstName || p.name}`} onClick={() => { setErr(''); setPick(p) }}>
            <span className="inv">&nbsp;{p.firstName || p.name}&nbsp;</span>
          </button>
        ))}
        {guests.map((g, i) => <span key={i} title="Guest">{g}</span>)}
        <button type="button" className="px" title="Add a guest (no sign-in needed)" onClick={() => { setErr(''); setAdding(true) }}><span className="inv">&nbsp;+ Guest&nbsp;</span></button>
      </div>
      {list.length > 0 && <div className="eng s hint">{onAir ? 'Take control opens when the show ends' : 'Tap a name to hand over control'}</div>}
      {/* The question still uses the old look, above the panel. */}
      {adding && body && createPortal(
        <div className="fixed inset-0 z-[96] grid place-items-center bg-black/85" role="dialog" aria-label="Add a guest">
          <form className="hw-screen p-10 space-y-5 max-w-xl w-full" onSubmit={e => { e.preventDefault(); void addGuest() }}>
            <p className="hw-title text-5xl text-center">Add a guest</p>
            <input className="w-full h-16 px-4 text-2xl text-black rounded" placeholder="Name" value={gName} maxLength={60} autoFocus onChange={e => setGName(e.target.value)} />
            <input className="w-full h-16 px-4 text-2xl text-black rounded" placeholder="Email" type="email" value={gEmail} maxLength={200} onChange={e => setGEmail(e.target.value)} />
            <label className="flex items-center gap-3 text-xl"><input type="checkbox" className="h-6 w-6" checked={gOk} onChange={e => setGOk(e.target.checked)} />Email me a link to the show</label>
            <p className="text-base opacity-70">Their name is listed as a host. We keep the email with this show.</p>
            {err && <p className="text-lg text-red-300">{err}</p>}
            <div className="flex gap-4 justify-center">
              <button type="button" className="gbtn h-16 px-10 text-2xl" onClick={() => setAdding(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="gbtn gbtn-go h-16 px-10 text-2xl" disabled={busy || !gName.trim() || !gEmail.trim()}>Add guest</button>
            </div>
          </form>
        </div>,
        body,
      )}
      {pick && body && createPortal(
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
        </div>,
        body,
      )}
    </>
  )
}
