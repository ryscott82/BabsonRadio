// Test stand-in for firebase/app, firebase/auth and firebase/firestore (only what the worker uses), with the worker's
// Firestore rules from babsonsound-web/firestore.rules checked on every write the worker makes. Data can be saved to a
// JSON file so a second test phase sees the first one's results.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export class Timestamp { constructor(ms) { this.ms = ms } toMillis() { return this.ms } }
const SERVER_TS = Symbol('serverTimestamp')
export const store = new Map()          // "col/id" -> data
const subs = new Set()
const FILE = process.env.FAKE_STORE_FILE

const enc = v => JSON.stringify([...store.entries()], (k, x) => (x instanceof Timestamp ? { __ts: x.ms } : x))
export function load() {
  if (!FILE || !existsSync(FILE)) return
  for (const [k, v] of JSON.parse(readFileSync(FILE, 'utf8'), (k, x) => (x && typeof x === 'object' && '__ts' in x ? new Timestamp(x.__ts) : x))) store.set(k, v)
}
const save = () => { if (FILE) writeFileSync(FILE, enc()) }
load()

const clone = v => (v instanceof Timestamp ? v : Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v)
const resolveTs = v => (v === SERVER_TS ? new Timestamp(Date.now()) : Array.isArray(v) ? v.map(resolveTs) : v && typeof v === 'object' && !(v instanceof Timestamp) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveTs(x)])) : v)
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o)

function snap(path, data) {
  const id = path.split('/')[1]
  return { id, ref: { path, id }, exists: () => data !== undefined, data: () => (data === undefined ? undefined : clone(data)), get: f => (data === undefined ? undefined : clone(getPath(data, f))) }
}
const matches = (q, data) => q.filters.every(f => (f.op === '==' ? getPath(data, f.f) === f.v : f.op === 'in' ? f.v.includes(getPath(data, f.f)) : false))
function runQuery(q) {
  const docs = [...store.entries()].filter(([k, d]) => k.startsWith(`${q.col}/`) && matches(q, d)).map(([k, d]) => snap(k, d))
  return { docs: q.lim ? docs.slice(0, q.lim) : docs, get size() { return this.docs.length }, get empty() { return !this.docs.length } }
}
function notify() { for (const s of subs) s() }

// ── the worker's Firestore rules (firestore.rules), as seen by uid studio-worker ──
const deny = why => { const e = new Error(`permission-denied: ${why}`); e.code = 'permission-denied'; throw e }
function checkWrite(path, before, after) {
  const [col, id] = path.split('/')
  const changed = () => [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(k => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
  if (col === 'workerStatus') return
  if (col === 'workerJobs') {
    if (!before) deny('create job')
    if (!['queued', 'running'].includes(before.status)) deny(`update job in ${before.status}`)
    if (!['running', 'done', 'failed'].includes(after.status)) deny(`job to ${after.status}`)
    const bad = changed().filter(k => !['status', 'startedAt', 'finishedAt', 'progress', 'error'].includes(k))
    if (bad.length) deny(`job keys ${bad}`)
    return
  }
  if (col === 'workerProposals') {
    if (!before) { if (after.status !== 'pending' || after.songId !== id) deny('proposal create'); return }
    if (after.songId !== before.songId) deny('songId changed')
    if (before.status === 'approved') {
      if (!['applied', 'failed'].includes(after.status)) deny('approved proposal to ' + after.status)
      const bad = changed().filter(k => !['status', 'updatedAt', 'error'].includes(k))
      if (bad.length) deny(`approved proposal keys ${bad}`)
      return
    }
    if (['pending', 'failed', 'applied'].includes(before.status) && after.status === 'pending') return
    if (before.status === 'rejected' && after.status === 'rejected') return
    deny(`proposal ${before.status} -> ${after.status}`)
  }
  deny(`write to ${col}`)
}
/** Writes made by the site (admin SDK) skip the rules. */
export function adminSet(path, data) { store.set(path, clone(resolveTs(data))); save(); notify() }
function clientWrite(path, after) {
  const before = store.get(path)
  checkWrite(path, before, after)
  store.set(path, after); save(); notify()
}

// ── firebase/app + firebase/auth ──
export const initializeApp = (cfg, name) => ({ cfg, name })
export const inMemoryPersistence = {}
export const initializeAuth = () => ({ currentUser: null })
export const connectAuthEmulator = () => {}
export async function signInWithCustomToken(auth, token) {
  if (token !== 'fake-custom-token') throw new Error('auth/invalid-custom-token')
  auth.currentUser = { uid: 'studio-worker', getIdToken: async () => 'fake-id-token' }
  return { user: auth.currentUser }
}

// ── firebase/firestore ──
export const getFirestore = () => ({})
export const connectFirestoreEmulator = () => {}
export const serverTimestamp = () => SERVER_TS
export const doc = (_db, col, id) => ({ path: `${col}/${id}`, id, col })
export const collection = (_db, col) => ({ col })
export const where = (f, op, v) => ({ kind: 'where', f, op, v })
export const limit = n => ({ kind: 'limit', n })
export const query = (c, ...cs) => ({ col: c.col, filters: cs.filter(x => x.kind === 'where'), lim: cs.find(x => x.kind === 'limit')?.n })
export const getDoc = async ref => snap(ref.path, store.get(ref.path))
export const getDocs = async q => runQuery(q)
function merge(a, b) {
  const out = { ...(a || {}) }
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v
  return out
}
export async function setDoc(ref, data, opts = {}) {
  const v = resolveTs(data)
  clientWrite(ref.path, opts.merge ? merge(clone(store.get(ref.path)), v) : clone(v))
}
function applyPatch(obj, patch) {
  const out = clone(obj)
  for (const [k, v] of Object.entries(resolveTs(patch))) {
    const parts = k.split('.'); let o = out
    for (const p of parts.slice(0, -1)) { o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {}; o = o[p] }
    o[parts.at(-1)] = v
  }
  return out
}
export async function updateDoc(ref, patch) {
  const cur = store.get(ref.path)
  if (!cur) throw new Error('not-found')
  clientWrite(ref.path, applyPatch(cur, patch))
}
export async function runTransaction(_db, fn) {
  return fn({ get: async ref => snap(ref.path, store.get(ref.path)), update: (ref, patch) => clientWrite(ref.path, applyPatch(store.get(ref.path), patch)) })
}
export function onSnapshot(target, next, _err) {
  let last = null
  const fire = () => {
    const s = target.filters ? runQuery(target) : snap(target.path, store.get(target.path))
    const key = JSON.stringify(target.filters ? s.docs.map(d => d.id) : s.data())
    if (key === last) return
    last = key
    try { next(s) } catch (e) { console.error(e) }
  }
  const sub = () => setImmediate(fire)
  subs.add(sub); sub()
  return () => subs.delete(sub)
}
