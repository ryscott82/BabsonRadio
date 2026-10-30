import 'server-only'
import { adminDb } from './admin'
import { cleanFormUrl } from '../studioForm'

// The Studio training form address: an admin sets it in Admin > Studio form (config/studioForm); STUDIO_FORM_URL in Vercel is the fallback.
const REF = () => adminDb().collection('config').doc('studioForm')
let memo: { at: number; url: string } | null = null

/** The address to show, or '' when none is set. Cached for 30 seconds on each server instance. */
export async function loadStudioFormUrl(): Promise<string> {
  if (memo && Date.now() - memo.at < 30_000) return memo.url
  let url = ''
  try { url = cleanFormUrl((await REF().get()).get('url')) ?? '' } catch { /* fall back below */ }
  if (!url) url = cleanFormUrl(process.env.STUDIO_FORM_URL) ?? ''
  memo = { at: Date.now(), url }
  return url
}

export async function saveStudioFormUrl(raw: string | null, uid: string): Promise<string> {
  if (raw === null || !raw.trim()) { await REF().set({ url: '', updatedAt: Date.now(), updatedBy: uid }); memo = null; return '' }
  const url = cleanFormUrl(raw)
  if (!url) throw new Error('Paste the link to your Microsoft Form (it starts with https://forms.office.com).')
  await REF().set({ url, updatedAt: Date.now(), updatedBy: uid })
  memo = null
  return url
}

export async function studioFormInfo() {
  const snap = await REF().get().catch(() => null)
  return { url: cleanFormUrl(snap?.get('url')) ?? '', fallbackSet: !!cleanFormUrl(process.env.STUDIO_FORM_URL), updatedAt: (snap?.get('updatedAt') as number | undefined) ?? null }
}
