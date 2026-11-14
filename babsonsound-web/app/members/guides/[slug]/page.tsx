import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { GUIDES, guideBySlug } from '@/lib/memberResources'
import GuideView from '@/components/members/GuideView'

// One guide from content/guides, built once per deploy (no server time when it is read).
export const dynamicParams = false
export const generateStaticParams = () => GUIDES.map(g => ({ slug: g.slug }))

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guideBySlug((await params).slug)
  return { title: g ? `${g.title} | Babson Radio` : 'Babson Radio', robots: { index: false, follow: false } }
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug)
  if (!g) notFound()
  const text = readFileSync(join(process.cwd(), 'content', 'guides', `${g.slug}.md`), 'utf8')
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <Link href="/members#resources" className="text-base text-br-gold underline underline-offset-4">Back to Resources</Link>
      <GuideView text={text} />
    </div>
  )
}
