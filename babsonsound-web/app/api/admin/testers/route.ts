import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { ANY_EMAIL, HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { normEmail, testerEmails } from '@/lib/server/testers'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    return { emails: await testerEmails() }
  })
}

// Add or remove one or more emails: { emails: ["a@babson.edu", ...], on: true | false }
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const raw = Array.isArray(b.emails) ? b.emails : []
    const emails = [...new Set(raw.map(e => normEmail(str(e, 200))).filter(Boolean))]
    if (!emails.length || emails.length > 200 || typeof b.on !== 'boolean') throw new HttpError(400, 'Invalid request.')
    const bad = emails.find(e => !ANY_EMAIL.test(e))
    if (bad) throw new HttpError(400, `${bad} is not a valid email address.`)
    await adminDb().collection('config').doc('betaTesters').set(
      { emails: b.on ? FieldValue.arrayUnion(...emails) : FieldValue.arrayRemove(...emails) }, { merge: true })
    return { emails: await testerEmails() }
  })
}
