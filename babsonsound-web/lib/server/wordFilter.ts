import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { HttpError } from './http'
import { BANNED, CRUDE, EMBED, EXPLICIT } from './wordLists'

// Words that may not go out to listeners or staff in a host's message. Three built-in levels (lib/server/wordLists.ts):
//   crude     clean but potentially crude (hell, damn, pussy, retarded). Blocked only when the show is set to "keep it clean".
//   explicit  profanity and sexual or violent language (fuck, shit, nigga, rape). Blocked by default.
//   banned    racial, ethnic and homophobic slurs. Blocked always, and nothing turns that off.
// Staff add their own words in Admin > Blocked words (config/blockedWords); those count as explicit.
// Matching ignores case, accents, look-alike characters (sh1t, $hit), stretched letters (fuuuck), spaced letters (f u c k),
// star-outs (f*ck) and words run together (fuckyou). It matches whole words, so "class", "Scunthorpe" and "cockpit" are fine.

export type Tier = 'crude' | 'explicit' | 'banned'
export type Level = 'crude' | 'explicit' // the lowest level that is blocked; banned is always blocked
const RANK: Record<Tier, number> = { crude: 1, explicit: 2, banned: 3 }

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '+': 't' }
/** Lowercase letters only, look-alikes resolved, runs of 3+ identical letters cut to 2 (so "fuuuuck" and "ass" both survive). */
const letters = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[0-9@$!+]/g, c => LEET[c] ?? c).replace(/[^a-z]/g, '')
export function norm(s: string): string { return letters(s).replace(/(.)\1{2,}/g, '$1$1') }
const once = (s: string) => s.replace(/(.)\1+/g, '$1')

const WORDS = new Map<string, Tier>()
const ONCE = new Map<string, [string, Tier]>() // list words with every double letter cut to one, for stretched words like "fuuuuck"
const BY_LEN = new Map<number, [string, Tier][]>()
const EMBEDS: [string, Tier][] = []
let built = false
function build() {
  if (built) return
  built = true
  const add = (list: readonly string[], tier: Tier) => { for (const w of list) { const n = norm(w); if (n.length >= 2 && (RANK[WORDS.get(n) ?? 'crude'] < RANK[tier] || !WORDS.has(n))) WORDS.set(n, tier) } }
  add(CRUDE, 'crude'); add(EXPLICIT, 'explicit'); add(BANNED, 'banned')
  for (const [w, t] of WORDS) { const o = once(w); if (o.length >= 4 && (!ONCE.has(o) || RANK[t] > RANK[ONCE.get(o)![1]])) ONCE.set(o, [w, t]); const a = BY_LEN.get(w.length) ?? []; a.push([w, t]); BY_LEN.set(w.length, a) }
  for (const t of ['crude', 'explicit', 'banned'] as const) for (const w of EMBED[t]) EMBEDS.push([norm(w), t])
}

/** Real words that contain a rude word. Never flagged. */
const ALLOW = new Set(['snigger', 'sniggers', 'sniggered', 'sniggering', 'niggard', 'niggards', 'niggardly', 'cockpit', 'cockpits', 'cocktail', 'cocktails', 'peacock', 'hancock', 'dickens', 'dickinson'])
/** Long phrases looked for in the whole message with the spaces taken out. Long enough that cross-word accidents do not happen. */
const PHRASES: [string, Tier][] = [
  ['killyourself', 'explicit'], ['goandkillyourself', 'explicit'], ['neckyourself', 'explicit'], ['hangyourself', 'explicit'], 
  ['whitepower', 'banned'], ['heilhitler', 'banned'], ['siegheil', 'banned'], ['gasthejews', 'banned'],
]

const best = (a: { tier: Tier; word: string } | null, tier: Tier, word: string) => (!a || RANK[tier] > RANK[a.tier] ? { tier, word } : a)
const SUFFIX = ['s', 'es', 'ed', 'er', 'ers', 'ing']

function lookup(n: string): { tier: Tier; word: string } | null {
  if (n.length < 2 || ALLOW.has(n)) return null
  const t = WORDS.get(n)
  if (t) return { tier: t, word: n }
  // fuckers -> fucker, bitchy -> bitch. Only for strong words, so "assess" never turns into "ass".
  if (n.length >= 6) for (const suf of SUFFIX) {
    if (!n.endsWith(suf)) continue
    const stem = n.slice(0, -suf.length)
    const st = WORDS.get(stem)
    if (stem.length >= 5 && st && RANK[st] >= RANK.explicit) return { tier: st, word: stem }
  }
  // Rude words stuck inside one long run-together word ("fuckyou", "thisisbullshit").
  if (n.length >= 6) for (const [e, tier] of EMBEDS) {
    const at = n.indexOf(e)
    if (at < 0 || n.length === e.length) continue
    if (e === 'nigger' && n[at - 1] === 's') continue // snigger, sniggerer
    return { tier, word: e }
  }
  return null
}

/** "f*ck", "sh*t", "b***h": every * stands for one letter. Needs 2+ real letters and 4+ characters in all. */
function starOut(tok: string): { tier: Tier; word: string } | null {
  const letters = tok.replace(/[^a-z]/g, '').length
  if (tok.length < 4 || letters < 2) return null
  const re = new RegExp('^' + tok.replace(/\*/g, '.') + '$')
  let hit: { tier: Tier; word: string } | null = null
  for (const [w, t] of BY_LEN.get(tok.length) ?? []) if (re.test(w)) hit = best(hit, t, w)
  return hit
}

/** The worst built-in or custom word in the text, or null when it is clean. Custom words count as explicit. */
export function findBad(text: string, custom: readonly string[] = []): { tier: Tier; word: string } | null {
  build()
  if (!text) return null
  let hit: { tier: Tier; word: string } | null = null
  const raw = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9@$!+*]+/).filter(Boolean)

  const check = (tok: string) => {
    if (tok.includes('*')) { const s = starOut(tok.replace(/^[!+@$]+|[!+@$]+$/g, '')); if (s) hit = best(hit, s.tier, s.word); return }
    // "shit!" ends in a symbol that is only punctuation; "$hit" starts with one that is a letter. Try the word each way.
    const variants = new Set([tok, tok.replace(/[!+@$0-9]+$/, ''), tok.replace(/^[!+@$]+/, ''), tok.replace(/^[!+@$]+/, '').replace(/[!+@$0-9]+$/, '')])
    for (const v of variants) {
      let h = lookup(norm(v))
      // Only words that were really stretched (3+ of one letter in a row) get the looser double-letter match.
      if (!h && /(.)\1\1/.test(letters(v))) { const o = ONCE.get(once(letters(v))); if (o) h = { tier: o[1], word: o[0] } }
      if (h) hit = best(hit, h.tier, h.word)
    }
  }
  for (const tok of raw) check(tok)

  // Letters spaced out: "f u c k", "s.h.i.t".
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].length !== 1) continue
    let j = i
    while (j < raw.length && raw[j].length === 1) j++
    if (j - i >= 3) { const h = lookup(norm(raw.slice(i, j).join(''))); if (h) hit = best(hit, h.tier, h.word) }
    i = j
  }

  const joined = norm(text)
  for (const [p, t] of PHRASES) if (joined.includes(p)) hit = best(hit, t, p)
  for (const w of custom) {
    const n = norm(w)
    if (n.length < 2) continue
    if (raw.some(tok => norm(tok) === n) || (n.length >= 5 && joined.includes(n))) hit = best(hit, 'explicit', n)
  }
  return hit
}

let cache: { at: number; custom: string[]; level: Level } | null = null

type Config = { custom: string[]; level: Level }
export async function loadConfig(db: Firestore): Promise<Config> {
  if (cache && Date.now() - cache.at < 60_000) return cache
  const d = await db.collection('config').doc('blockedWords').get()
  const custom = Array.isArray(d.get('words')) ? (d.get('words') as unknown[]).map(w => String(w).trim().toLowerCase()).filter(Boolean) : []
  const level: Level = d.get('level') === 'crude' ? 'crude' : 'explicit'
  cache = { at: Date.now(), custom, level }
  return cache
}

/** Staff's own extra words (the built-in lists are not in here). */
export const loadBlocked = async (db: Firestore) => (await loadConfig(db)).custom

export async function saveBlocked(db: Firestore, input: unknown, uid: string, level?: unknown): Promise<Config> {
  const custom = [...new Set((Array.isArray(input) ? input : []).map(w => String(w).trim().toLowerCase().slice(0, 40)).filter(w => w.length >= 2))].slice(0, 500)
  const lv: Level = level === 'crude' ? 'crude' : level === 'explicit' ? 'explicit' : (await loadConfig(db)).level
  await db.collection('config').doc('blockedWords').set({ words: custom, level: lv, updatedBy: uid, updatedAt: new Date() })
  cache = null
  return { custom, level: lv }
}

export const builtInCounts = () => { build(); const c = { crude: 0, explicit: 0, banned: 0 }; for (const t of WORDS.values()) c[t]++; return c }

const MESSAGE: Record<Tier, string> = {
  banned: 'That message has language we never allow, on air or anywhere else. Reword it and try again.',
  explicit: 'That message has a word we do not allow on air. Reword it and try again.',
  crude: 'That message has a crude word, and the show is keeping things clean right now. Reword it and try again.',
}

/** Throws a friendly error if the text has a word blocked at the current level. Never repeats the word back. */
export async function assertClean(db: Firestore, ...texts: string[]): Promise<void> {
  const { custom, level } = await loadConfig(db)
  for (const text of texts) {
    const hit = findBad(text, custom)
    if (hit && (hit.tier === 'banned' || RANK[hit.tier] >= RANK[level])) throw new HttpError(400, MESSAGE[hit.tier], 'BR-HST-004')
  }
}
