import { NextResponse } from 'next/server'
import { getShowBySlug, getEpisodesByShow } from '@/lib/firestore'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const show = await getShowBySlug(slug)
  if (!show) return new NextResponse('Show not found', { status: 404 })

  const episodes = await getEpisodesByShow(show.id)
  const siteURL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://babsonsound.com'

  const items = episodes.map(ep => {
    const pubDate = ep.publishedAt?.seconds
      ? new Date(ep.publishedAt.seconds * 1000).toUTCString()
      : new Date(ep.publishedAt).toUTCString()

    const audioURL = ep.audioURL ?? ''
    const description = ep.description ?? ep.title

    return `
    <item>
      <title><![CDATA[${ep.title}]]></title>
      <description><![CDATA[${description}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${ep.guid ?? ep.id}</guid>
      <itunes:duration>${ep.duration ?? 0}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>
      ${ep.episodeNumber ? `<itunes:episode>${ep.episodeNumber}</itunes:episode>` : ''}
      ${ep.seasonNumber  ? `<itunes:season>${ep.seasonNumber}</itunes:season>` : ''}
      ${ep.thumbnailURL  ? `<itunes:image href="${ep.thumbnailURL}" />` : ''}
      ${audioURL ? `<enclosure url="${audioURL}" type="audio/mpeg" length="0" />` : ''}
      ${ep.youtubeID ? `<link>https://www.youtube.com/watch?v=${ep.youtubeID}</link>` : ''}
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${show.name}]]></title>
    <description><![CDATA[${show.description ?? ''}]]></description>
    <link>${siteURL}/shows/${show.slug}</link>
    <language>${show.rssLanguage ?? 'en-us'}</language>
    <itunes:author>${show.rssAuthor ?? show.hostNames?.join(', ') ?? 'Babson Radio'}</itunes:author>
    <itunes:email>${show.rssEmail ?? 'radio@babson.edu'}</itunes:email>
    <itunes:explicit>${show.rssExplicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:category text="${show.category ?? 'Music'}" />
    ${show.artworkURL ? `<itunes:image href="${show.artworkURL}" />` : ''}
    <image>
      <url>${show.artworkURL ?? `${siteURL}/icon.png`}</url>
      <title>${show.name}</title>
      <link>${siteURL}/shows/${show.slug}</link>
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
