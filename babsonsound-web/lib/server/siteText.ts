import 'server-only'
import { adminDb } from './admin'
import { SITE_TEXT, type SiteTextValues } from '../siteText'

const REF = () => adminDb().collection('siteText').doc('main')

/** What admins have changed (only the keys they changed). Never throws: pages fall back to the built-in words. */
export async function loadSiteText(): Promise<SiteTextValues> {
  try {
    const v = (await REF().get()).get('values') as SiteTextValues | undefined
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

/** Save one text, or pass null to go back to the built-in words. */
export async function saveSiteText(key: string, value: string | null, uid: string): Promise<SiteTextValues> {
  if (!SITE_TEXT.some(i => i.key === key)) throw new Error('Unknown text.')
  const clean = value === null ? null : String(value).replace(/\r\n/g, '\n').slice(0, 2000)
  const ref = REF()
  const cur = { ...(await loadSiteText()) }
  if (clean === null || !clean.trim()) delete cur[key]; else cur[key] = clean
  await ref.set({ values: cur, updatedAt: Date.now(), updatedBy: uid })
  return cur
}
