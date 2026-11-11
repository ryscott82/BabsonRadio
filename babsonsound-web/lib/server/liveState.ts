import 'server-only'
import { after } from 'next/server'
import type { Firestore } from 'firebase-admin/firestore'
import type { SharedBundle } from '../liveBundle'
import { LIVE_STATE_DOC, LIVE_STATE_MIN_GAP_MS, liveStateOf, publishDecision, stateHash } from '../liveState'

// Writes the pushed document (liveState/current): skip tally, vote tally and set list for what is on air. Web pages listen to it, so these
// numbers are not polled. It is written only when the content changed, and no more than once every LIVE_STATE_MIN_GAP_MS per server instance.
// A change that arrives inside that gap is written once the gap is over (a trailing write after the response, see `after`), so the last
// change is never lost. Two instances can both write, which is harmless: it is the same data and a few writes a minute at most.
let last: { hash: string; at: number } | null = null
let trailing = false

export async function publishLiveState(db: Firestore, shared: SharedBundle, rebuild: () => Promise<SharedBundle>, now = Date.now()): Promise<'same' | 'write' | 'wait'> {
  const state = liveStateOf(shared)
  const hash = stateHash(state)
  const d = publishDecision(hash, last, now)
  if (d === 'write') {
    last = { hash, at: now }
    try { await db.collection(LIVE_STATE_DOC.collection).doc(LIVE_STATE_DOC.id).set(state) } catch (e) { last = null; throw e }
  } else if (d === 'wait' && !trailing && last) {
    trailing = true
    const wait = Math.max(1_000, LIVE_STATE_MIN_GAP_MS - (now - last.at) + 500)
    try {
      after(async () => {
        await new Promise(r => setTimeout(r, wait))
        trailing = false
        await publishLiveState(db, await rebuild(), rebuild).catch(e => console.error('[live state]', e))
      })
    } catch { trailing = false } // not inside a request (a script): the next change will write it
  }
  return d
}

export const forgetLiveStateMemory = () => { last = null; trailing = false }
