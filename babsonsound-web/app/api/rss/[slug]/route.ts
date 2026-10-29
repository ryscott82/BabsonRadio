import { NextResponse } from 'next/server'
import { getShowBySlug, getEpisodesByShow } from '@/lib/firestore'
import { cdata, escXml, intOr0, safeUrl } from '@/lib/xml'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const show = await getShowBySlug(slug)
  if (!show) return new NextResponse('Show not found', { status: 404 })

  const episodes = await getEpisodesByShow(show.id)
  const siteURL = safeUrl(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://babsonsound.com').replace(/\/$/, '') || 'https://babsonsound.com'
  const showLink = `${siteURL}/shows/${encodeURIComponent(show.slug)}`

  // Every value below is escaped for where it lands: text in CDATA (cdata), plain text and attributes (escXml), numbers (intOr0).
  const items = episodes.map(ep => {
    const when = ep.publishedAt?.seconds ? new Date(ep.publishedAt.seconds * 1000) : new Date(ep.publishedAt)
    const pubDate = Number.isNaN(when.getTime()) ? '' : when.toUTCString()

    const audioURL = safeUrl(ep.audioURL)
    const thumb = safeUrl(ep.thumbnailURL)
    const description = ep.description ?? ep.title
    const episode = intOr0(ep.episodeNumber), season = intOr0(ep.seasonNumber)

    return `
    <item>
      <title>${cdata(ep.title)}</title>
      <description>${cdata(description)}</description>
      <pubDate>${escXml(pubDate)}</pubDate>
      <guid isPermaLink="false">${escXml(ep.guid ?? ep.id)}</guid>
      <itunes:duration>${intOr0(ep.duration)}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>
      ${episode ? `<itunes:episode>${episode}</itunes:episode>` : ''}
      ${season ? `<itunes:season>${season}</itunes:season>` : ''}
      ${thumb ? `<itunes:image href="${escXml(thumb)}" />` : ''}
      ${audioURL ? `<enclosure url="${escXml(audioURL)}" type="audio/mpeg" length="0" />` : ''}
      ${ep.youtubeID ? `<link>${escXml(`https://www.youtube.com/watch?v=${encodeURIComponent(String(ep.youtubeID))}`)}</link>` : ''}
    </item>`
  }).join('\n')

  const artwork = safeUrl(show.artworkURL)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${cdata(show.name)}</title>
    <description>${cdata(show.description ?? '')}</description>
    <link>${escXml(showLink)}</link>
    <language>${escXml(show.rssLanguage ?? 'en-us')}</language>
    <itunes:author>${escXml(show.rssAuthor ?? show.hostNames?.join(', ') ?? 'Babson Radio')}</itunes:author>
    <itunes:email>${escXml(show.rssEmail ?? 'radio@babson.edu')}</itunes:email>
    <itunes:explicit>${show.rssExplicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:category text="${escXml(show.category ?? 'Music')}" />
    ${artwork ? `<itunes:image href="${escXml(artwork)}" />` : ''}
    <image>
      <url>${escXml(artwork || `${siteURL}/icon.png`)}</url>
      <title>${escXml(show.name)}</title>
      <link>${escXml(showLink)}</link>
    </image>
    ${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 's-maxage=300, stale-while-revalidate',
    },
  })
}
