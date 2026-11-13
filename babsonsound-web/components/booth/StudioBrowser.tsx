'use client'

import { helper, errText } from './helper'

// The studio browser: a normal Chrome window beside the booth (tools/studio-helper/lib/browser.mjs). Quick links open it split screen
// (the booth keeps its left column); Full screen leaves the booth a slim rail. It has its own Chrome profile, so people can stay signed in.

export interface BrowserState { open: boolean; layout: '' | 'split' | 'full'; railPx: number; since?: number }

export const QUICK_LINKS = [
  { label: 'YouTube', url: 'https://www.youtube.com/' },
  { label: 'Google Docs', url: 'https://docs.google.com/' },
  { label: 'Notion', url: 'https://www.notion.so/' },
] as const

/** While the browser is open the booth counts as in use (like music playing), but only for this long, so a forgotten window still signs out. */
export const BROWSER_ACTIVE_MS = 3 * 3_600_000

export async function openBrowser(token: string, url: string, layout: 'split' | 'full' = 'split') {
  return helper<BrowserState>('/browser/open', { token, url, layout })
}
export const setBrowserLayout = async (token: string, layout: 'split' | 'full') => helper<BrowserState>('/browser/layout', { token, layout })
export const closeBrowser = () => helper<BrowserState>('/browser/close', {})

/** The small buttons in the booth's header: quick links when closed; Full screen / Split and Close when open. */
export function BrowserButtons({ state, getToken, onError, className }: { state: BrowserState | null; getToken: () => Promise<string>; onError: (m: string) => void; className: string }) {
  const run = (fn: () => Promise<unknown>) => { void fn().catch(e => onError(errText(e))) }
  if (state?.open) {
    return (
      <>
        <button type="button" className={className} onClick={() => run(async () => setBrowserLayout(await getToken(), state.layout === 'full' ? 'split' : 'full'))}>
          {state.layout === 'full' ? 'Split screen' : 'Full screen'}
        </button>
        <button type="button" className={className} onClick={() => run(closeBrowser)}>Close browser</button>
      </>
    )
  }
  return (
    <>
      {QUICK_LINKS.map(l => (
        <button key={l.label} type="button" className={className} onClick={() => run(async () => openBrowser(await getToken(), l.url))}>{l.label}</button>
      ))}
      <button type="button" className={className} onClick={() => run(async () => openBrowser(await getToken(), 'https://www.google.com/'))}>Browser</button>
    </>
  )
}
