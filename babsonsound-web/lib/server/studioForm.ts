import 'server-only'
import { adminDb } from './admin'
import { cleanFormUrl, formUrlFor } from '../studioForm'

// The Studio training form: an admin sets the address and whether it shows inside the page (Admin > Studio form, config/studioForm).
// STUDIO_FORM_URL in Vercel is the fallback address. By default the form opens in its own window; showing it inside the page needs the
// form to be shared with "Anyone can respond" (otherwise Microsoft's sign-in page refuses to load in a frame).
const REF = () => adminDb().collection('config').doc('studioForm')
let memo: { at: number; url: string; embed: boolean } | null = null

/** What /studioaccess hands out: the address (adjusted for the chosen mode) and the mode. url is '' when none is set. Cached for 30 seconds. */
export async function loadStudioForm(): Promise<{ url: string; embed: boolean }> {
  if (memo && Date.now() - memo.at < 30_000) return memo
  let url = '', embed = false
  try { const s = await REF().get(); url = cleanFormUrl(s.get('url')) ?? ''; embed = s.get('embed') === true } catch { /* fall back below */ }
  if (!url) url = cleanFormUrl(process.env.STUDIO_FORM_URL) ?? ''
  memo = { at: Date.now(), url: url ? formUrlFor(url, embed) : '', embed }
  return memo
}

/** Saves the address and/or the show-inside-the-page switch. Leave a field out to keep it. An empty url clears the address. */
export async function saveStudioForm(o: { url?: string; embed?: boolean }, uid: string) {
  const data: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: uid }
  if (typeof o.url === 'string') {
    if (!o.url.trim()) data.url = ''
    else {
      const url = cleanFormUrl(o.url)
      if (!url) throw new Error('Paste the link to your Microsoft Form (it starts with https://forms.office.com).')
      data.url = url
    }
  }
  if (typeof o.embed === 'boolean') data.embed = o.embed
  await REF().set(data, { merge: true })
  memo = null
}

export async function studioFormInfo() {
  const snap = await REF().get().catch(() => null)
  return {
    url: cleanFormUrl(snap?.get('url')) ?? '', embed: snap?.get('embed') === true,
    fallbackSet: !!cleanFormUrl(process.env.STUDIO_FORM_URL), updatedAt: (snap?.get('updatedAt') as number | undefined) ?? null,
  }
}
