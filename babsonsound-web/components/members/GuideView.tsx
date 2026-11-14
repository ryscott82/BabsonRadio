'use client'

import DocView from '@/components/admin/DocView'

/** A member guide, with the same small Markdown reader the admin guides use (no raw HTML). Web links open in a new tab. */
export default function GuideView({ text }: { text: string }) {
  return <div className="text-br-dk-text"><DocView text={text} links={{ byFile: {}, open: () => {} }} /></div>
}
