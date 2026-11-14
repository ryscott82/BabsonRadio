// Door scan notice. The door QR code writes boothDoorPing/latest ({ claimId, at }) in Firestore. The helper listens to that one document
// (a Firestore listen with the Firebase client SDK: no website calls, no polling) and, when someone scans while the booth panel is not up,
// shows a Windows notification "Someone scanned the door code" with a button that opens the booth. It never opens the booth by itself.
// Rules: not for the scan that is already there when the helper starts, once per scan, only for a scan under 60 s old (the claim expires
// then), never in maintenance mode, and only when no booth window is running.

export const FRESH_MS = 60_000

/** deps: { now(), boothRunning() -> Promise<bool>, maintenance() -> bool, toast() -> Promise, log? } */
export function createDoorWatch(deps) {
  const log = deps.log || (() => {})
  let first = true, last = ''
  return {
    /** Call with each snapshot's data (or undefined when the document doesn't exist). Returns what it did, for the tests and the log. */
    async onPing(d) {
      const id = d ? String(d.claimId || d.at || '') : ''
      if (first) { first = false; last = id; return 'baseline' }
      if (!id || id === last) return 'same'
      last = id
      const at = Number(d.at) || 0
      if (deps.now() - at > FRESH_MS) return 'old'
      if (deps.maintenance()) return 'maintenance'
      if (await deps.boothRunning().catch(() => true)) return 'booth-up'
      await deps.toast()
      log('DOOR SCAN   the booth was not up: showed the notification')
      return 'toast'
    },
  }
}
