import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import beatsFile from '@/data/beats.json'
import { adminDb } from './admin'
import { HttpError } from './http'
import { BEAT_SHARD_MAX_BYTES, beatKey, beatShard } from '../worker'

// Tempo + first-beat position per song. Stored in Firestore (libraryBeats/{first character of the key}, field `m`: key -> [bpm, firstBeatSeconds])
// so new analysis shows up without a redeploy; each shard is cached in memory for 10 minutes. data/beats.json stays as the fallback
// (used when a shard is missing, a song is not in it, or Firestore is unreachable). Keys: artist + "|" + title, letters and digits only.

const TTL = 10 * 60_000
const shards = new Map<string, { at: number; m: Record<string, number[]> | null }>()
const file = beatsFile as Record<string, number[]>

async function shard(db: Firestore, name: string): Promise<Record<string, number[]> | null> {
  const hit = shards.get(name)
  if (hit && Date.now() - hit.at < TTL) return hit.m
  let m: Record<string, number[]> | null = null
  try { m = ((await db.collection('libraryBeats').doc(name).get()).get('m') as Record<string, number[]> | undefined) ?? null }
  catch (e) { console.error('[beats]', e) }
  shards.set(name, { at: Date.now(), m })
  return m
}

/** [bpm, firstBeatSeconds] for the song, or null when it hasn't been analyzed. */
export async function lookupBeat(artist: string, title: string): Promise<{ bpm: number; offset: number } | null> {
  const key = beatKey(artist, title)
  if (key === '|') return null
  let hit: number[] | undefined
  try { hit = (await shard(adminDb(), beatShard(key)))?.[key] } catch { /* fall back to the file */ }
  hit ??= file[key]
  if (!hit || !(hit[0] >= 50 && hit[0] <= 220)) return null
  return { bpm: hit[0], offset: Math.max(0, hit[1] || 0) }
}

/** Set (or, with null, remove) beats. Entries are { key, value }. Refuses a shard that would grow past ~450 KB. */
export async function writeBeats(db: Firestore, entries: { key: string; value: [number, number] | null }[]): Promise<number> {
  const by = new Map<string, typeof entries>()
  for (const e of entries) by.set(beatShard(e.key), [...(by.get(beatShard(e.key)) ?? []), e])
  for (const [name, list] of by) {
    const ref = db.collection('libraryBeats').doc(name)
    await db.runTransaction(async tx => {
      const m = { ...(((await tx.get(ref)).get('m') as Record<string, number[]> | undefined) ?? {}) }
      for (const e of list) { if (e.value) m[e.key] = e.value; else delete m[e.key] }
      if (Buffer.byteLength(JSON.stringify(m)) > BEAT_SHARD_MAX_BYTES) throw new HttpError(413, 'That beats shard is full.', 'BR-LIB-012')
      tx.set(ref, { m, updatedAt: FieldValue.serverTimestamp() })
    })
    shards.delete(name)
  }
  return entries.length
}

/** One-time import of the bundled data/beats.json into Firestore. Shards that already exist are left alone unless force is set. */
export async function importBundledBeats(db: Firestore, force = false): Promise<{ shards: number; songs: number; skipped: number }> {
  const groups = new Map<string, Record<string, number[]>>()
  for (const [k, v] of Object.entries(file)) { const s = beatShard(k); groups.set(s, { ...(groups.get(s) ?? {}), [k]: v }) }
  let shardsWritten = 0, songs = 0, skipped = 0
  for (const [name, m] of groups) {
    const ref = db.collection('libraryBeats').doc(name)
    if (!force && (await ref.get()).exists) { skipped++; continue }
    if (Buffer.byteLength(JSON.stringify(m)) > BEAT_SHARD_MAX_BYTES) throw new HttpError(413, 'That beats shard is full.', 'BR-LIB-012')
    await ref.set({ m, updatedAt: FieldValue.serverTimestamp() })
    shards.delete(name); shardsWritten++; songs += Object.keys(m).length
  }
  return { shards: shardsWritten, songs, skipped }
}
