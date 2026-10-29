import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireVerifiedMember } from '@/lib/server/http'
import { requireAppCheck } from '@/lib/server/appCheck'
import { indexKeyFromHash } from '@/lib/server/phone'
import { encryptJson } from '@/lib/server/pii'

export const runtime = 'nodejs'

const MAX_LABELS = 300

// Body: { labels: [{ hash, name }] } — the name the caller saved for a contact that MATCHED a member (the app never sends names
// for anyone else). It is stored encrypted on the caller's own users/{me}/connections/{them}.contactName and only ever returned
// to the caller (lib/server/friends.ts), which is how the website shows the same name. Names for hashes that are not one of the
// caller's contact connections are ignored, so this route can't be used to learn anything about a number. An empty name removes the label.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireVerifiedMember(req)
    await requireAppCheck(req)
    const { labels } = await readJson(req)
    if (!Array.isArray(labels) || labels.length === 0 || labels.length > MAX_LABELS) throw new HttpError(400, `Send between 1 and ${MAX_LABELS} names.`)

    const want = new Map<string, string>() // phoneIndex key → name
    for (const l of labels) {
      const o = (l ?? {}) as Record<string, unknown>
      if (typeof o.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(o.hash)) continue
      const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
      want.set(indexKeyFromHash(o.hash), name)
    }
    if (!want.size) return { ok: true, saved: 0 }

    const db = adminDb()
    const keys = [...want.keys()]
    const people = await db.getAll(...keys.map(k => db.collection('phoneIndex').doc(k)))
    const target = people.map(s => ({ uid: s.exists ? (s.get('uid') as string | undefined) : undefined, name: want.get(s.id)! }))
      .filter((x): x is { uid: string; name: string } => !!x.uid && x.uid !== t.uid)
    if (!target.length) return { ok: true, saved: 0 }

    const conn = (uid: string) => db.collection('users').doc(t.uid).collection('connections').doc(uid)
    const have = await db.getAll(...target.map(x => conn(x.uid)))
    const batch = db.batch()
    let saved = 0
    target.forEach((x, i) => {
      if (!have[i].exists || have[i].get('source') !== 'contacts') return // only people matched through contacts
      batch.set(conn(x.uid), { contactName: x.name ? encryptJson(x.name) : FieldValue.delete() }, { merge: true })
      saved++
    })
    if (saved) await batch.commit()
    return { ok: true, saved }
  })
}
