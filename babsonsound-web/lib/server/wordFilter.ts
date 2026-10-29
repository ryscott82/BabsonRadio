import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { HttpError } from './http'
import { BANNED, CRUDE, EMBED, EXPLICIT, PHRASES } from './wordLists'

// Words that may not go out to listeners or staff in a host's message. Three built-in levels (lib/server/wordLists.ts):
//   crude     clean but potentially crude (hell, damn, pussy, retarded). Blocked only when the show is set to "keep it clean".
//   explicit  profanity and sexual or violent language (fuck, shit, nigga, rape). Blocked by default.
//   banned    racial, ethnic and homophobic slurs. Blocked always, and nothing turns that off.
// Staff add their own words in Admin > Blocked words (config/blockedWords); those count as explicit.
//
// What it sees through: capital letters, accents, look-alike letters from other alphabets, invisible characters, look-alike digits and
// symbols (sh1t, $hit), stretched or doubled letters (fuuuck, fuckk), spaced or dotted letters (f u c k, f.u.c.k), words run together
// (fuckyou) and star-outs (f**k). It matches whole words, so "class", "Scunthorpe" and "cockpit" are fine.
//
// Star-outs: in the default mode a starred-out ordinary swear word (f**k) is allowed. A starred-out slur (n****r) never is,
// and "keep it clean" blocks every star-out.

export type Tier = 'crude' | 'explicit' | 'banned'
export type Level = 'crude' | 'explicit' // the lowest level that is blocked; banned is always blocked
const RANK: Record<Tier, number> = { crude: 1, explicit: 2, banned: 3 }
export type Hit = { tier: Tier; word: string; /** written with * standing in for letters, like f**k */ starred: boolean }

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '+': 't' }
// Letters from other alphabets that look like Latin ones.
const LOOK: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j', ѕ: 's', һ: 'h', ԁ: 'd', ԛ: 'q', ԝ: 'w', к: 'k', м: 'm', н: 'h', т: 't', в: 'b',
  α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', τ: 't', υ: 'u', ν: 'v', χ: 'x', ϲ: 'c', ɡ: 'g', ɑ: 'a', ı: 'i', ℓ: 'l', ø: 'o', ƒ: 'f', ß: 'ss', æ: 'ae',
}
/** Lowercase, accents and invisible characters gone, look-alike letters turned into Latin ones. */
function plain(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ​-‏‪-‮⁠-⁤᠎﻿­]/g, '').toLowerCase()
    .replace(/[Ͱ-ϿЀ-ӿɐ-ʯßæøıƒℓ]/g, c => LOOK[c] ?? c)
}
const letters = (s: string) => plain(s).replace(/[0-9@$!+]/g, c => LEET[c] ?? c).replace(/[^a-z]/g, '')
/** Lowercase letters only, look-alikes resolved, runs of 3+ identical letters cut to 2 (so "fuuuuck" and "ass" both survive). */
export function norm(s: string): string { return letters(s).replace(/(.)\1{2,}/g, '$1$1') }
const once = (s: string) => s.replace(/(.)\1+/g, '$1')

const WORDS = new Map<string, Tier>()
const ONCE = new Map<string, [string, Tier]>() // list words with every double letter cut to one, for "fuuuuck" and "fuckk"
const BY_LEN = new Map<number, [string, Tier][]>()
const EMBEDS: [string, Tier][] = []
const PHR: { toks: string[]; tier: Tier }[] = []
let built = false
function build() {
  if (built) return
  built = true
  const add = (list: readonly string[], tier: Tier) => { for (const w of list) { const n = norm(w); if (n.length >= 2 && (!WORDS.has(n) || RANK[WORDS.get(n)!] < RANK[tier])) WORDS.set(n, tier) } }
  add(CRUDE, 'crude'); add(EXPLICIT, 'explicit'); add(BANNED, 'banned')
  for (const [w, t] of WORDS) {
    const o = once(w)
    if (o.length >= 4 && (!ONCE.has(o) || RANK[t] > RANK[ONCE.get(o)![1]])) ONCE.set(o, [w, t])
    const a = BY_LEN.get(w.length) ?? []; a.push([w, t]); BY_LEN.set(w.length, a)
  }
  for (const t of ['crude', 'explicit', 'banned'] as const) {
    for (const w of EMBED[t]) EMBEDS.push([norm(w), t])
    for (const p of PHRASES[t]) PHR.push({ toks: p.map(norm), tier: t })
  }
}

/** Real words that look rude. Never flagged. */
const ALLOW = new Set(['snigger', 'sniggers', 'sniggered', 'sniggering', 'niggard', 'niggards', 'niggardly', 'cockpit', 'cockpits', 'cocktail', 'cocktails', 'peacock', 'hancock',
  'dickens', 'dickinson', 'shiite', 'shiites', 'shitake', 'assess', 'assist', 'assume', 'bass', 'class', 'mass', 'pass', 'grass', 'glass', 'brass', 'hello', 'shell', 'cummings', 'cumbria', 'cumberland',
  'rapping', 'rapped', 'rappe', 'rappee', 'rappees', 'rappes', 'pollack', 'pollacks', 'collie', 'collies', 'conns', 'woops', 'skeeter', 'skeeters',
  'shitakes', 'shittah', 'shittahs', 'shittim', 'shittims', 'shittimwood', 'shittimwoods', 'shitzu', 'shitzus',
  'fagotto', 'fagotti', 'contrafagotto', 'contrafagottos', 'fagottist', 'fagottists'])
/** Ordinary words that can start a pair like "who re-elected" and must not be read as a split rude word. */
const SPLIT_SKIP = new Set(['who', 'bit', 'to', 'the', 'for', 'you', 'and', 'are', 'was', 'bum', 'eye', 'jew', 'woo', 'ped', 'a', 'i'])
/** Long phrases looked for in the whole message with the spaces taken out (only ones long enough to be safe). */
const RUN: [string, Tier][] = [['killyourself', 'explicit'], ['goandkillyourself', 'explicit'], ['neckyourself', 'explicit'], ['hangyourself', 'explicit'], ['whitepower', 'banned'], ['heilhitler', 'banned'], ['siegheil', 'banned'], ['gasthejews', 'banned']]
/** Starts of words that are always rude, so "shitposting" and "fuckwad" are caught even if the exact word is not listed. */
const STARTS: [string, Tier][] = [['fuck', 'explicit'], ['shit', 'explicit'], ['bitch', 'explicit'], ['cunt', 'explicit'], ['whore', 'explicit'], ['motherf', 'explicit'], ['nigger', 'banned'], ['faggot', 'banned']]

const better = (a: Hit | null, h: Hit) => (!a || RANK[h.tier] > RANK[a.tier] ? h : a)

function lookup(n: string): Omit<Hit, 'starred'> | null {
  if (n.length < 2 || ALLOW.has(n)) return null
  const t = WORDS.get(n)
  if (t) return { tier: t, word: n }
  // fuckers -> fucker, bitchy -> bitch. Only for strong words, so "assess" never turns into "ass".
  if (n.length >= 6) for (const suf of ['s', 'es', 'ed', 'er', 'ers', 'ing']) {
    if (!n.endsWith(suf)) continue
    const stem = n.slice(0, -suf.length), st = WORDS.get(stem)
    if (stem.length >= 5 && st && RANK[st] >= RANK.explicit) return { tier: st, word: stem }
  }
  // Doubled or stretched letters: "fuckk", "shiit", "niggaaa".
  const o = n.length >= 4 && once(n) !== n ? ONCE.get(once(n)) : undefined // only when the word really has a doubled letter (so "Niger" stays fine)
  if (o && RANK[o[1]] >= RANK.explicit) return { tier: o[1], word: o[0] }
  if (n.length >= 5) for (const [s, tier] of STARTS) if (n.length > s.length && n.startsWith(s)) return { tier, word: s }
  // Rude words stuck inside one long run-together word ("fuckyou", "thisisbullshit").
  if (n.length >= 6) for (const [e, tier] of EMBEDS) {
    const at = n.indexOf(e)
    if (at < 0 || n.length === e.length) continue
    if (e === 'nigger' && n[at - 1] === 's') continue // snigger, sniggerer
    return { tier, word: e }
  }
  return null
}

/** "f*ck", "sh*t", "n****r": every * stands for one letter. Needs 2+ real letters and 4+ characters in all. */
function starOut(tok: string): Omit<Hit, 'starred'> | null {
  const lets = tok.replace(/[^a-z]/g, '').length
  if (tok.length < 4 || lets < 2 || !/^[a-z]/.test(tok)) return null
  const re = new RegExp('^' + tok.replace(/\*/g, '.') + '$')
  let hit: Omit<Hit, 'starred'> | null = null
  for (const [w, t] of BY_LEN.get(tok.length) ?? []) if (re.test(w) && (!hit || RANK[t] > RANK[hit.tier])) hit = { tier: t, word: w }
  return hit
}

/** Every rude word found in the text, one entry per kind (worst first is not guaranteed; see findBad). */
export function findAll(text: string, custom: readonly string[] = []): Hit[] {
  build()
  if (!text) return []
  const hits: Hit[] = []
  const push = (h: Omit<Hit, 'starred'> | null, starred = false) => { if (h) hits.push({ ...h, starred }) }
  const base = plain(text)

  const tokensOf = (s: string) => s.split(/[^a-z0-9@$!+*]+/).filter(Boolean)
  const checkToken = (tok: string) => {
    if (tok.includes('*')) { push(starOut(tok.replace(/^[!+@$]+|[!+@$]+$/g, '')), true); return }
    if (tok === '1488') { push({ tier: 'banned', word: '1488' }); return }
    // "shit!" ends in a symbol that is only punctuation; "$hit" starts with one that is a letter. Try the word each way.
    for (const v of new Set([tok, tok.replace(/[!+@$0-9]+$/, ''), tok.replace(/^[!+@$]+/, ''), tok.replace(/^[!+@$]+/, '').replace(/[!+@$0-9]+$/, '')])) push(lookup(norm(v)))
  }
  const raw = tokensOf(base)
  raw.forEach(checkToken)
  // Dots, dashes and similar between pieces: "f.u.c.k", "fu-ck", "sh_it". (Apostrophes are left alone, so "he'll" is not "hell".)
  const glued = base.replace(/(?<=[a-z0-9])[.\-_|/\\·•~]+(?=[a-z0-9])/g, '')
  if (glued !== base) tokensOf(glued).forEach(checkToken)

  // Letters spaced out: "f u c k".
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].length !== 1) continue
    let j = i
    while (j < raw.length && raw[j].length === 1) j++
    if (j - i >= 3) push(lookup(norm(raw.slice(i, j).join(''))))
    i = j
  }

  // A rude word split into pieces: "ni gga", "nig ger", "fu ck". Two or three pieces in a row, checked with the spaces taken out.
    const pieces = raw.map(norm).filter(Boolean)
  for (let i = 0; i < pieces.length - 1; i++) {
    for (let n = 2; n <= 3 && i + n <= pieces.length; n++) {
      const part = pieces.slice(i, i + n)
      if (part.every(x => x.length > 4) || part.some(x => ALLOW.has(x))) continue // whole words next to each other are not a split word
      const h = lookup(part.join(''))
      if (!h) continue
      const w = h.word.length
      // Slurs match however they are split. Other words only as two short pieces (3 letters or fewer each): "fu ck", "sh it", "bi tch".
      if (h.tier === 'banned' || (h.tier === 'explicit' && n === 2 && part.every(x => x.length <= 3) && (w >= 5 || part.every(x => x.length >= 2)) && !SPLIT_SKIP.has(part[0])) || (h.tier === 'explicit' && n === 2 && w >= 5 && part[0].length === 1 && !SPLIT_SKIP.has(part[0]))) push(h)
    }
  }

  // Phrases: the words in a row.
  const seq = pieces
  for (const p of PHR) {
    for (let i = 0; i + p.toks.length <= seq.length; i++) if (p.toks.every((t, k) => seq[i + k] === t)) { hits.push({ tier: p.tier, word: p.toks.join(' '), starred: false }); break }
  }
  const joined = norm(text)
  for (const [p, t] of RUN) if (joined.includes(p)) hits.push({ tier: t, word: p, starred: false })
  if (/\u{1F595}/u.test(text)) hits.push({ tier: 'crude', word: 'middle finger', starred: false })

  for (const w of custom) {
    const n = norm(w)
    if (n.length < 2) continue
    if (raw.some(tok => norm(tok) === n) || (n.length >= 5 && joined.includes(n))) hits.push({ tier: 'explicit', word: n, starred: false })
  }
  return hits
}

/** The worst rude word in the text, or null when it is clean. */
export function findBad(text: string, custom: readonly string[] = []): Hit | null {
  let best: Hit | null = null
  for (const h of findAll(text, custom)) best = better(best, h)
  return best
}

/** Does this word get blocked at this setting? Banned: always. Star-outs of other words: only when keeping it clean. */
export const blocks = (h: Hit, level: Level): boolean =>
  h.tier === 'banned' ? true : h.starred ? level === 'crude' : RANK[h.tier] >= RANK[level]

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

export const builtInCounts = () => { build(); const c = { crude: 0, explicit: 0, banned: 0, phrases: PHR.length }; for (const t of WORDS.values()) c[t]++; return c }

const MESSAGE: Record<Tier, string> = {
  banned: 'That message has language we never allow, on air or anywhere else. Reword it and try again.',
  explicit: 'That message has a word we do not allow on air. Reword it and try again.',
  crude: 'That message has a crude word, and the show is keeping things clean right now. Reword it and try again.',
}

/** Throws a friendly error if the text has a word blocked at the current setting. Never repeats the word back. */
export async function assertClean(db: Firestore, ...texts: string[]): Promise<void> {
  const { custom, level } = await loadConfig(db)
  for (const text of texts) {
    let worst: Hit | null = null
    for (const h of findAll(text, custom)) if (blocks(h, level)) worst = better(worst, h)
    if (worst) throw new HttpError(400, MESSAGE[worst.tier], 'BR-HST-004')
  }
}

/** Same check as assertClean, for names: throws a name-specific error (BR-ACC-025). Empty names pass (callers decide if one is required). */
export async function assertCleanName(db: Firestore, ...names: string[]): Promise<void> {
  const { custom, level } = await loadConfig(db)
  for (const n of names) {
    if (n && findAll(n, custom).some(h => blocks(h, level))) throw new HttpError(400, 'Pick a different name.', 'BR-ACC-025')
  }
}

/** The text if it passes the filter, otherwise the fallback. For names that came from outside our own forms (a token's name, an Apple profile). */
export async function cleanOr(db: Firestore, text: string, fallback = ''): Promise<string> {
  if (!text) return text
  const { custom, level } = await loadConfig(db)
  return findAll(text, custom).some(h => blocks(h, level)) ? fallback : text
}

/**
 * For text shown to listeners that we do not write ourselves (song titles, artists, albums): masks explicit and never-allowed words
 * with stars, keeping the first letter and any ending, like "N***as" or "Starf***er". Always on, whatever the "keep it clean" setting is.
 * Crude words (hell, damn) are left alone. Words already starred out in the source are left as they are.
 */
export function censor(text: string): string {
  if (!text) return text
  return text.replace(/[\p{L}\p{N}@$+*]+/gu, tok => {
    if (tok.includes('*') || tok.length < 3) return tok
    const hit = findAll(tok).filter(h => !h.starred && RANK[h.tier] >= RANK.explicit).sort((a, b) => b.word.length - a.word.length)[0]
    if (!hit) return tok
    const low = tok.toLowerCase()
    // Find the rude part inside the word (the list word, or its stem without a doubled/stretched letter); otherwise cover it all.
    const core = [hit.word, once(hit.word)].find(c => low.includes(c))
    let from = 0, to = tok.length
    if (core) { from = low.indexOf(core); to = from + core.length } 
    // A whole word of 5+ letters keeps its last two (N***as, B***es); a rude part inside a longer word keeps what is around it (Starf***er).
    if (from === 0 && to === tok.length && tok.length >= 5) to = tok.length - 2
    const mask = (seg: string) => seg[0] + '*'.repeat(Math.max(seg.length - 1, 1))
    return tok.slice(0, from) + mask(tok.slice(from, to)) + tok.slice(to)
  })
}
