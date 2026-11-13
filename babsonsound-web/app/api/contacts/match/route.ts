import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireVerifiedMember } from '@/lib/server/http'
import { requireAppCheck } from '@/lib/server/appCheck'
import { indexKeyFromHash, withoutBlocked } from '@/lib/server/phone'
import { beginSync, flagSync } from '@/lib/server/contactSync'
import { MAX_PER_REQUEST, anomaly } from '@/lib/contactLimits'

export const runtime = 'nodejs'

// Body: { hashes: string[] } — hex SHA-256 of each contact's E.164 number (see lib/phone.ts).
// Reply: { matched: [{ hash, mutual }], capped }. It names nobody: no uid, no first name. The app already knows which of its own
// contacts each hash belongs to, so it marks those; the connection itself is stored here (users/{me}/connections/{them}).
// Built so it can't work as a reverse phone lookup: verified school email only, App Check on iOS, one sync a day, a cap on new
// numbers per rolling 30 days, and a pause when a sync looks like a scrape (lib/contactLimits.ts).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireVerifiedMember(req)
    await requireAppCheck(req)
    const { hashes } = await readJson(req)
    if (!Array.isArray(hashes) || hashes.length === 0 || hashes.length > MAX_PER_REQUEST) {
      throw new HttpError(400, `Send between 1 and ${MAX_PER_REQUEST} hashes.`)
    }
    // Babson's own lines are dropped before anything is looked up.
    const valid = withoutBlocked([...new Set(hashes.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h)))])
    if (!valid.length) throw new HttpError(400, 'No valid hashes.')

    const db = adminDb()
    const sync = await beginSync(db, t.uid, 'match', valid)

    const byKey = new Map(sync.hashes.map(h => [indexKeyFromHash(h), h]))
    const hashesOf = new Map<string, string[]>() // matched member uid → the hashes (contacts) that led to them
    const keys = [...byKey.keys()]
    for (let i = 0; i < keys.length; i += 300) {
      for (const snap of await db.getAll(...keys.slice(i, i + 300).map(k => db.collection('phoneIndex').doc(k)))) {
        const uid = snap.get('uid')
        // Numbers are not SMS-verified (and may never be), so matching runs on every entry. `verified` is kept for later.
        if (snap.exists && uid && uid !== t.uid) hashesOf.set(uid, [...(hashesOf.get(uid) ?? []), byKey.get(snap.id)!])
      }
    }

    const why = anomaly({ sent: sync.hashes.length, matched: hashesOf.size })
    if (why) {
      const me = await db.collection('users').doc(t.uid).get()
      await flagSync(db, t.uid, why, { email: String(t.email ?? ''), name: [me.get('firstName'), me.get('lastName')].filter(Boolean).join(' ') })
      throw new HttpError(403, 'Contacts are paused on your Babson Sound account. Contact Babson Sound if this is a mistake.', 'BR-CON-007')
    }

    const uids = [...hashesOf.keys()]
    const mine = (u: string) => db.collection('users').doc(t.uid).collection('connections').doc(u)
    const theirs = (u: string) => db.collection('users').doc(u).collection('connections').doc(t.uid)
    const matched: { hash: string; mutual: boolean }[] = []
    for (let i = 0; i < uids.length; i += 100) {
      const chunk = uids.slice(i, i + 100)
      const [users, reverse, existing] = await Promise.all([
        db.getAll(...chunk.map(u => db.collection('users').doc(u))),
        db.getAll(...chunk.map(theirs)),
        db.getAll(...chunk.map(mine)),
      ])
      const batch = db.batch()
      let writes = 0
      chunk.forEach((uid, n) => {
        if (!users[n].exists) return
        const mutual = reverse[n].exists
        for (const hash of hashesOf.get(uid)!) matched.push({ hash, mutual })
        // Only write what changed: a repeat sync of the same people costs no writes here.
        if (!existing[n].exists || existing[n].get('mutual') !== mutual) {
          batch.set(mine(uid), { source: 'contacts', mutual, createdAt: Timestamp.now() }, { merge: true }); writes++
        }
        if (mutual && reverse[n].get('mutual') !== true) { batch.update(theirs(uid), { mutual: true }); writes++ }
      })
      if (writes) await batch.commit()
    }

    await db.collection('users').doc(t.uid).update({
      contactsSyncedAt: FieldValue.serverTimestamp(), lastSyncMatches: uids.length,
    })
    return { matched, capped: sync.capped }
  })
}
