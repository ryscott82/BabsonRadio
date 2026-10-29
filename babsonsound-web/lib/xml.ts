// Escaping for the RSS feed. Everything that goes into the XML passes through one of these.

/** Text or attribute value: & < > " ' become entities (control characters XML forbids are dropped). */
export function escXml(v: unknown): string {
  return String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** A CDATA section. "]]>" inside the text would end it early, so it is split across two sections. */
export function cdata(v: unknown): string {
  return `<![CDATA[${String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`
}

/** A whole number for numeric elements (episode, season, duration), never user text. */
export const intOr0 = (v: unknown): number => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0 }

/** Only http(s) URLs go into href/url attributes; anything else becomes empty. */
export function safeUrl(v: unknown): string {
  try { const u = new URL(String(v ?? '')); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '' } catch { return '' }
}
