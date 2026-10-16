import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { HOST_WINDOW_MS, hostContext, occurrenceId, showOpen } from '@/lib/server/host'
import { azNowPlaying } from '@/lib/server/azuracast'
import { canEditAnyShow } from '@/lib/server/host'
import { birthdaysToday } from '@/lib/server/birthdays'
import { rowOf } from '@/lib/server/playlistRequests'
import { EMOJIS, getNote, parseSongs, reactionSummary } from '@/lib/server/live'

export const runtime = 'nodejs'

// Everything the host panel needs: my shows, whether the controls are open, what is playing.
export async function GET(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const c = await hostContext(req, db, now)
    const controlsOpen = c.staff || c.open.length > 0
    let nowPlaying = null
    if (controlsOpen) nowPlaying = await azNowPlaying().catch(() => null)

    const pending = (await db.collection('showUpdates').where('requestedBy', '==', c.t.uid).get()).docs
      .filter(d => d.get('status') === 'pending').map(d => ({ id: d.id, scheduleId: d.get('scheduleId'), showName: d.get('showName') ?? '' }))

    // Passive feed for each show whose window is open: pinned note, reactions, ratings, upvoted songs.
    const insights: Record<string, unknown> = {}
    for (const sh of c.open.slice(0, 3)) {
      const id = occurrenceId(sh)
      const [note, rx, ratings, list, votes, rqDoc, rqList, plList, colorDoc] = await Promise.all([
        getNote(db, id, now), reactionSummary(db, id, now),
        db.collection('ratings').where('occId', '==', id).get(),
        db.collection('setlists').doc(id).get(), db.collection('setlistVotes').doc(id).get(),
        db.collection('liveRequests').doc(id).get(), db.collection('songRequests').where('occId', '==', id).get(),
        db.collection('playlistRequests').where('occId', '==', id).get(),
        db.collection('liveColor').doc(id).get(),
      ])
      const stars = ratings.docs.map(d => d.get('stars') as number)
      const v = (votes.get('votes') ?? {}) as Record<string, string[]>
      insights[id] = {
        comments: ratings.docs.filter(d => d.get('comment')).map(d => ({ stars: d.get('stars'), text: d.get('comment'), at: d.get('at')?.toMillis?.() ?? 0 })).sort((a, b) => b.at - a.at).slice(0, 20),
        colorChanging: colorDoc.exists && colorDoc.get('on') === true,
        requestsOpen: rqDoc.exists && rqDoc.get('open') === true,
        requests: rqList.docs.map(d => ({ id: d.id, text: d.get('text'), name: d.get('name'), at: d.get('at').toMillis() })).sort((a, b) => b.at - a.at).slice(0, 30),
        playlistRequests: plList.docs.map(rowOf).sort((a, b) => b.at - a.at).slice(0, 50),
        note, reactions: rx.total, recentReactions: rx.recent,
        ratingCount: stars.length, ratingAvg: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : 0,
        songs: parseSongs(String(list.get('songs') ?? '')).map(x => ({ ...x, votes: v[x.id]?.length ?? 0 })).sort((a, b) => b.votes - a.votes),
      }
    }

    const birthdays = controlsOpen ? (await birthdaysToday(db, now).catch(() => [])).map(p => p.name) : []

    return {
      birthdays,
      hosting: c.open.length > 0,
      staff: c.staff, canEditAny: await canEditAnyShow(db, c.t), emojis: EMOJIS, insights, controlsOpen, windowHours: HOST_WINDOW_MS / 3_600_000, now,
      shows: c.shows.map(s => ({ ...s, id: occurrenceId(s), open: showOpen(s, now) })),
      nowPlaying, pending,
    }
  })
}
