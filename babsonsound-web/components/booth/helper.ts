import { BOOTH_HELPER_ORIGIN } from '@/lib/booth'
import type { CSSProperties } from 'react'

// Talks to the studio helper on 127.0.0.1 (tools/studio-helper).

export interface Butt { connected: boolean; connecting: boolean; recording: boolean; signal: boolean; silence: boolean; streamSeconds: number; volumeLeft: number; volumeRight: number; song: string }
export interface Track { id: string; title: string; artist: string; length: number; playlists: string[]; bed: boolean; stationId: boolean; pad: boolean; ad: boolean }
export type LibraryKind = 'beds' | 'ids' | 'pads' | 'ads' | 'all'

export async function library(token: string, kind: LibraryKind, q = ''): Promise<Track[]> {
  return (await helper<{ tracks: Track[] }>('/library', { token, kind, q })).tracks
}

/** Inline style that tints a steel key (same trick as the nav). */
export const keyTint = (rgb: string, a = 0.7) => ({ '--hw-key-tint': `linear-gradient(rgba(${rgb},${a}), rgba(${rgb},${a}))` }) as CSSProperties
export const RED_KEY = keyTint('200,48,42', 0.78)
export const GREEN_KEY = keyTint('14,143,97', 0.6)

export async function helper<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BOOTH_HELPER_ORIGIN}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(body && path === '/library' ? 25_000 : 8_000),
    })
  } catch { throw new Error("The studio helper isn't running.") }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'The studio helper refused.')
  return data as T
}

export const trackUrl = (id: string, token: string) =>
  `${BOOTH_HELPER_ORIGIN}/library/play/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(x).padStart(2, '0')}`
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

/** Settings saved on this PC (the kiosk keeps its own Chrome profile). Storage can be blocked, so every call is guarded. */
export function loadPref(key: string, fallback = ''): string {
  try { return localStorage.getItem(`booth.${key}`) ?? fallback } catch { return fallback }
}
export function savePref(key: string, value: string) {
  try { localStorage.setItem(`booth.${key}`, value) } catch { /* not saved */ }
}

/** Proof (from the helper) that this page is on the studio PC, for the booth routes that run before anyone signs in. */
export async function attestHeaders(): Promise<Record<string, string>> {
  const nonce = `${Date.now()}.${crypto.getRandomValues(new Uint32Array(3)).join('').slice(0, 24)}`
  const { sig } = await helper<{ sig: string }>(`/attest?nonce=${encodeURIComponent(nonce)}`)
  return { 'x-booth-nonce': nonce, 'x-booth-sig': sig }
}

/** Call one of our /api/booth routes as the studio PC (nobody signed in). */
export async function boothFetch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(await attestHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
  return data as T
}

/** Night on the booth: from 7 pm to 7 am the whole page goes pure black. */
export const isNight = (ms: number) => { const h = new Date(ms).getHours(); return h >= 19 || h < 7 }
