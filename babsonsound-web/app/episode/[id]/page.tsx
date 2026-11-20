import type { Metadata } from 'next'
import { adminDb } from '@/lib/server/admin'
import { toEpisode } from '@/lib/server/episodes'
import { isEpisodeId, shareDescription } from '@/lib/episodePlayer'
import EpisodeView from '@/components/EpisodeView'

// One episode, with an address that can be shared (babsonradio.com/episode/<id>). The page itself loads the episode in the browser, so a private
// one still asks for a sign-in. Only a PUBLIC episode puts its title and description into the link preview; anything else shows the plain site card.
export const dynamic = 'force-dynamic'
interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string | string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const plain: Metadata = { title: 'Episode — Babson Radio' }
  if (!isEpisodeId(id)) return plain
  try {
    const snap = await adminDb().collection('episodes').doc(id).get()
    if (!snap.exists || snap.get('visibility') !== 'public') return plain
    const e = toEpisode(snap.id, snap.data()!)
    const description = shareDescription(e)
    return {
      title: `${e.title} — Babson Radio`, description,
      openGraph: { title: e.title, description, type: 'article', ...(e.thumbnailURL ? { images: [e.thumbnailURL] } : {}) },
      twitter: { card: e.thumbnailURL ? 'summary_large_image' : 'summary', title: e.title, description },
    }
  } catch { return plain }
}

export default async function EpisodePage({ params, searchParams }: Props) {
  const { id } = await params
  const t = (await searchParams).t
  return <EpisodeView id={id} t={Array.isArray(t) ? t[0] : t ?? ''} />
}
