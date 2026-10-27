import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireBabson } from '@/lib/server/http'
import { cleanInstagram } from '@/lib/instagram'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'

// A student's Instagram handle (optional). Students only; Guests get 403. It is stored as typed-and-cleaned text and is never checked
// against Instagram.   POST { instagram }  add or change it ("@name" or a pasted instagram.com link)   POST { remove: true }  take it off.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireBabson(req)
    const b = await readJson(req)
    const ref = adminDb().collection('users').doc(t.uid)
    if (b.remove === true) {
      // Removing it also stops the setup prompt from asking again (same back-off as a phone number that was removed).
      await ref.update({ instagram: FieldValue.delete(), 'setup.skips.instagram.count': 3, 'setup.skips.instagram.lastSkippedAt': Date.now() })
      return { ok: true, instagram: '' }
    }
    const handleName = cleanInstagram(b.instagram)
    if (!handleName) throw new HttpError(400, 'Enter your Instagram handle, like @name, or paste your profile link.', 'BR-SET-010')
    await ref.update({ instagram: handleName })
    return { ok: true, instagram: handleName }
  })
}
