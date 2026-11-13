'use client'

import { helper, errText } from './helper'

// The studio browser: a normal Chrome window beside the booth (tools/studio-helper/lib/browser.mjs). Quick links open it split screen
// (the booth keeps its left column); Full screen leaves the booth a slim rail. It has its own Chrome profile, so people can stay signed in.

export interface BrowserState { open: boolean; layout: '' | 'split' | 'full'; railPx: number; since?: number }

export const QUICK_LINKS = [
  { label: 'YouTube', url: 'https://www.youtube.com/' },
  { label: 'Google Docs', url: 'https://docs.google.com/' },
  { label: 'Notion', url: 'https://www.notion.so/' },
  { label: 'BandLab', url: 'https://www.bandlab.com/' },
] as const

/** While the browser is open the booth counts as in use (like music playing), but only for this long, so a forgotten window still signs out. */
export const BROWSER_ACTIVE_MS = 3 * 3_600_000

export async function openBrowser(token: string, url: string, layout: 'split' | 'full' = 'split') {
  return helper<BrowserState>('/browser/open', { token, url, layout })
}
export const setBrowserLayout = async (token: string, layout: 'split' | 'full') => helper<BrowserState>('/browser/layout', { token, layout })
export const closeBrowser = () => helper<BrowserState>('/browser/close', {})

const ICON = 'h-8 w-8'
const ICONS: Record<string, React.ReactNode> = {
  YouTube: <svg viewBox="0 0 24 24" className={ICON} aria-hidden><rect x="2" y="5" width="20" height="14" rx="4.5" fill="currentColor" opacity=".9" /><path d="M10 9l5.5 3L10 15z" fill="#000" /></svg>,
  'Google Docs': <svg viewBox="0 0 24 24" className={ICON} aria-hidden><path d="M6 2h8l5 5v15H6z" fill="currentColor" opacity=".9" /><path d="M14 2v5h5" fill="#000" opacity=".35" /><path d="M9 12h7M9 15h7M9 18h5" stroke="#000" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  Notion: <svg viewBox="0 0 24 24" className={ICON} aria-hidden><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity=".9" /><path d="M8.5 16.5v-9l7 9v-9" stroke="#000" strokeWidth="1.9" fill="none" strokeLinejoin="round" strokeLinecap="round" /></svg>,
  BandLab: <svg viewBox="0 0 24 24" className={ICON} aria-hidden><circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".9" /><path d="M7 14v-4M10 16V8M13 14v-4M16 12.5v-1" stroke="#000" strokeWidth="2" strokeLinecap="round" /></svg>,
  Browser: <svg viewBox="0 0 24 24" className={ICON} aria-hidden><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>,
  Full: <svg viewBox="0 0 24 24" className={ICON} aria-hidden><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  Split: <svg viewBox="0 0 24 24" className={ICON} aria-hidden><rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 4v16" stroke="currentColor" strokeWidth="2" /></svg>,
  Close: <svg viewBox="0 0 24 24" className={ICON} aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>,
}

/** One icon button: a word-free picture with a spoken label and a tooltip, sized for a finger. */
export function IconButton({ label, onClick, icon, danger }: { label: string; onClick: () => void; icon: keyof typeof ICONS; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`gbtn h-14 w-14 grid place-items-center ${danger ? 'gbtn-stop' : ''}`}>{ICONS[icon]}</button>
  )
}

/** The studio browser's icon row (header on the console, and the home page, where `onLocked` is given: a tap there goes to sign-in instead of opening anything): YouTube, Google Docs, Notion and a plain
 *  browser when closed; Full screen / Split screen and Close when open. */
export function BrowserButtons({ state, getToken, onError, onLocked }: { state: BrowserState | null; getToken: () => Promise<string>; onError: (m: string) => void; onLocked?: () => void }) {
  const run = (fn: () => Promise<unknown>) => { if (onLocked) { onLocked(); return } void fn().catch(e => onError(errText(e))) }
  if (state?.open) {
    const full = state.layout === 'full'
    return (
      <>
        <IconButton label={full ? 'Split screen' : 'Full screen'} icon={full ? 'Split' : 'Full'} onClick={() => run(async () => setBrowserLayout(await getToken(), full ? 'split' : 'full'))} />
        <IconButton label="Close browser" icon="Close" onClick={() => run(closeBrowser)} />
      </>
    )
  }
  return (
    <>
      {QUICK_LINKS.map(l => <IconButton key={l.label} label={`Open ${l.label}`} icon={l.label} onClick={() => run(async () => openBrowser(await getToken(), l.url))} />)}
      <IconButton label="Open the web browser" icon="Browser" onClick={() => run(async () => openBrowser(await getToken(), 'https://www.google.com/'))} />
    </>
  )
}
