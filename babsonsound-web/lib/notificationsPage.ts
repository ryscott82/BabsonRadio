import { BROADCAST_BODY_MAX, BROADCAST_TITLE_MAX } from './broadcastGuard.ts'

// The Notifications page: the words it shows, in one place, so the tests can check them. Pure (no React, no fetch).

export const ALERTS_URL = '/api/admin/alerts'
export const BROADCAST_URL = '/api/admin/broadcast'
export const ALL_CLEAR = 'All clear'

export const goesTo = (phones: number) => `Goes to ${phones} phone${phones === 1 ? '' : 's'}`

export interface Draft { title: string; body: string }
export const clip = (d: Draft): Draft => ({ title: d.title.slice(0, BROADCAST_TITLE_MAX), body: d.body.slice(0, BROADCAST_BODY_MAX) })
/** What the person may press Send for: both parts filled in, and at least one phone to receive it. */
export const canSend = (d: Draft, phones: number) => d.title.trim() !== '' && d.body.trim() !== '' && phones > 0
export const counter = (text: string, max: number) => `${text.length} / ${max}`

/** The sentence in the confirm box: the title, the message and the count, and that it cannot be undone. */
export function confirmBody(d: Draft, phones: number): string {
  return `Title: ${d.title.trim()}\nMessage: ${d.body.trim()}\n${goesTo(phones)}. This cannot be undone.`
}
/** The number on the Notifications tab: alerts that have not been dismissed. */
export const unreadCount = (items: readonly unknown[] | null | undefined) => items?.length ?? 0
