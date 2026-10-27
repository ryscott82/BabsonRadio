import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember } from '@/lib/server/http'
import { indexKeyFromHash, withoutBlocked } from '@/lib/server/phone'
import { MAX_KEYS, MIN_OTHERS, popularity, rebuildIfStale, removeContactGraph, setContactGraph } from '@/lib/server/contactGraph'

export const runtime = 'nodejs'

// On for everyone who has shared their contacts with the app, except people in invisible mode. Body: { hashes: string[] } (hex SHA-256 of each contact's E.164 number, see lib/phone.ts) or { remove: true }.
// Returns the contacts that many members have saved, as [{ hash, others }], so the app can suggest them as
// "probably at Babson". Names never leave the phone.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const db = adminDb()
    if (!process.env.PHONE_HASH_PEPPER) throw new HttpError(503, 'This is not switched on yet.', 'BR-CON-002')

    // Invisible mode is the opt-out: nothing from this person's contacts is kept or counted.
    const invisible = (await db.collection('users').doc(t.uid).get()).get('invisible') === true
    if (invisible) { await removeContactGraph(db, t.uid); return { saved: [], invisible: true } }

    if (b.remove === true) { await removeContactGraph(db, t.uid); return { saved: [] } }

    const hashes = Array.isArray(b.hashes) ? b.hashes : []
    // Babson's own lines are dropped before anything is stored or counted.
    const unique = withoutBlocked([...new Set(hashes.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h)))]).slice(0, MAX_KEYS)
    if (!unique.length) throw new HttpError(400, 'No contacts to check.')

    // Twice a day is plenty, keeps Firestore writes tiny, and stops anyone from probing numbers in bulk.
    const ref = db.collection('contactGraph').doc(t.uid)
    const last = ((await ref.get()).get('updatedAt') as Timestamp | undefined)?.toMillis() ?? 0
    if (Date.now() - last < 12 * 3_600_000) throw new HttpError(429, 'Contacts were checked recently. Try again later.', 'BR-CON-003')

    const byKey = new Map(unique.map(h => [indexKeyFromHash(h), h]))
    const keys = [...byKey.keys()]
    await setContactGraph(db, t.uid, keys)

    after(() => rebuildIfStale(db).catch(() => {})) // counts refresh at most once a day
    const counts = await popularity(db, keys)
    const popular = keys.filter(k => (counts.get(k) ?? 0) - 1 >= MIN_OTHERS) // minus this member
    // Skip people who already have the app: they are not an invite.
    const members = new Set<string>()
    for (let i = 0; i < popular.length; i += 300) {
      for (const s of await db.getAll(...popular.slice(i, i + 300).map(k => db.collection('phoneIndex').doc(k)))) if (s.exists && s.get('verified') === true) members.add(s.id)
    }
    return { saved: popular.filter(k => !members.has(k)).map(k => ({ hash: byKey.get(k)!, others: (counts.get(k) ?? 1) - 1 })) }
  })
}
