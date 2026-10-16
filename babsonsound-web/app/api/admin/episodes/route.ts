import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'
import { recentEpisodes, slugify, youtubeId } from '@/lib/server/episodes'
import { assertAllAdults, consentValid } from '@/lib/server/publicContent'
import { adminAuth } from '@/lib/server/admin'

export const runtime = 'nodejs'

const CATEGORIES = ['Music', 'Interview', 'Podcast', 'Talk', 'News']

export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    return { items: await recentEpisodes(adminDb(), 200), categories: CATEGORIES }
  })
}

// Add a YouTube video to the library: { url, showName, category, title?, description? }.
// The title is filled in from YouTube when left blank.
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const id = youtubeId(str(b.url, 300))
    if (!id) throw new HttpError(400, 'That does not look like a YouTube link.')
    const showName = str(b.showName, 80)
    if (!showName) throw new HttpError(400, 'Enter the show name.')
    const category = CATEGORIES.includes(str(b.category, 20)) ? str(b.category, 20) : 'Podcast'

    // Ask YouTube about the video: confirms it exists and can be embedded, and gives us the title.
    let title = str(b.title, 140)
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(6_000) })
      if (r.status === 401 || r.status === 404) throw new HttpError(400, 'YouTube cannot find that video, or it does not allow embedding.')
      if (r.ok && !title) title = String(((await r.json()) as { title?: string }).title ?? '').slice(0, 140)
    } catch (e) { if (e instanceof HttpError) throw e }
    if (!title) throw new HttpError(400, 'Enter a title.')

    const db = adminDb()

    // Hosts (their school emails) so ages can be checked and so only they can sign for public sharing.
    const hostEmails = str(b.hostEmails, 400).split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 6)
    const hostUids: string[] = []
    for (const e of hostEmails) {
      try { hostUids.push((await adminAuth().getUserByEmail(e)).uid) } catch { throw new HttpError(400, `No account found for ${e}.`) }
    }

    // Everything is private (students only) unless a signed, adult host agreement covers it.
    let visibility: 'public' | 'private' = 'private'
    let publicConsentId = ''
    if (b.visibility === 'public') {
      await assertAllAdults(db, hostUids)
      const slots = await db.collection('airSlots').where('requesterUid', 'in', hostUids.slice(0, 10)).get()
      const cover = slots.docs.find(d => d.get('makePublic') === true && String(d.get('title')).trim().toLowerCase() === showName.toLowerCase()
        && hostUids.includes(String(d.get('requesterUid'))))
      if (!cover || !(await consentValid(db, cover.get('publicConsentId'), hostUids))) {
        throw new HttpError(403, "That host hasn't signed to share this show publicly. Leave it private; the host can sign for it from their Host page.", 'BR-PUB-005')
      }
      visibility = 'public'; publicConsentId = String(cover.get('publicConsentId'))
    }

    const showSlug = slugify(showName)
    const show = await db.collection('shows').where('slug', '==', showSlug).limit(1).get()
    const ref = await db.collection('episodes').add({
      title, showName, showSlug, showId: show.docs[0]?.id ?? '', category, description: str(b.description, 600),
      youtubeID: id, thumbnailURL: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, duration: 0,
      publishedAt: Timestamp.now(), isNew: true, isFeatured: false,
      visibility, hostUids, ...(publicConsentId ? { publicConsentId } : {}),
    })
    return { ok: true, id: ref.id }
  })
}

// Remove one: { id }
export async function DELETE(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const id = str((await readJson(req)).id, 100)
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Bad episode.')
    await adminDb().collection('episodes').doc(id).delete()
    return { ok: true }
  })
}
