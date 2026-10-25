import Link from 'next/link'

/** Plain text with [words](link) links. Pages use it for words an admin can change. */
export default function Rich({ text, className = 'text-br-gold underline underline-offset-4' }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0, m: RegExpExecArray | null, n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const href = m[2]
    parts.push(href.startsWith('/')
      ? <Link key={n++} href={href} className={className}>{m[1]}</Link>
      : /^https?:\/\//.test(href) || href.startsWith('mailto:')
        ? <a key={n++} href={href} target="_blank" rel="noopener noreferrer" className={className}>{m[1]}</a>
        : m[0])
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
