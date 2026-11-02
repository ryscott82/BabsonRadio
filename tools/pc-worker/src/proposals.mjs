import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { sortKeyOf } from './rules.mjs'

// Writes what a job found into workerProposals/{songId}, as "pending" for an admin to approve.
// A proposal that is approved or rejected is never touched. One document per song collects metadata, art, beat and loudness.

const ID = /^[0-9A-Za-z_-]{1,64}$/
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const tagsOf = t => ({ title: text(t?.title), artist: text(t?.artist), album: text(t?.album) })
const conf = v => Math.max(0, Math.min(1, Number(v) || 0))

export function makeProposals(db) {
  async function upsert(songId, current, fresh, patch) {
    if (!ID.test(String(songId))) return 'skipped'
    const ref = doc(db, 'workerProposals', String(songId))
    const snap = await getDoc(ref)
    const cur = tagsOf(current)
    if (!snap.exists()) {
      const proposed = { ...cur, confidence: 1, source: 'none', ...fresh.proposed }
      await setDoc(ref, {
        songId: String(songId), status: 'pending', current: cur, ...fresh, proposed,
        sortKey: sortKeyOf(proposed.artist || cur.artist, proposed.title || cur.title), updatedAt: serverTimestamp(), error: null,
      })
      return 'created'
    }
    const status = snap.get('status')
    if (status === 'approved' || status === 'rejected') return 'kept'
    const p = snap.get('proposed') || {}
    const artist = patch['proposed.artist'] ?? p.artist ?? cur.artist, title = patch['proposed.title'] ?? p.title ?? cur.title
    await updateDoc(ref, { status: 'pending', current: cur, ...patch, sortKey: sortKeyOf(artist, title), updatedAt: serverTimestamp(), error: null })
    return 'updated'
  }

  return {
    metadata: m => {
      const t = tagsOf(m.proposed), c = conf(m.proposed?.confidence), source = text(m.proposed?.source, 40) || 'rules'
      return upsert(m.id, m.current, { proposed: { ...t, confidence: c, source } },
        { 'proposed.title': t.title, 'proposed.artist': t.artist, 'proposed.album': t.album, 'proposed.confidence': c, 'proposed.source': source })
    },
    art: m => {
      const url = text(m.artUrl, 500)
      if (!/^https:\/\/\S+$/.test(url)) return 'skipped'
      return upsert(m.id, m.current, { proposed: { artUrl: url, confidence: conf(m.confidence), source: `art:${text(m.source, 20)}` } }, { 'proposed.artUrl': url })
    },
    beat: m => {
      const bpm = Number(m.beat?.bpm), firstBeat = Number(m.beat?.firstBeat)
      if (!(bpm >= 50 && bpm <= 220) || !(firstBeat >= 0)) return 'skipped'
      const beat = { bpm, firstBeat }
      return upsert(m.id, m.current, { beat, proposed: { source: 'beats' } }, { beat })
    },
    loudness: m => {
      const lufs = Number(m.loudness?.lufs), gainDb = Number(m.loudness?.gainDb)
      if (!Number.isFinite(lufs) || !Number.isFinite(gainDb) || Math.abs(gainDb) > 24) return 'skipped'
      const loudness = { lufs, gainDb }
      return upsert(m.id, m.current, { loudness, proposed: { source: 'loudness' } }, { loudness })
    },
  }
}
