import type { ReactNode } from 'react'

// A small Markdown reader for the admin guides: headings, paragraphs, lists, tables, quotes, code and links. Built from elements (no raw HTML), so a guide can never inject markup.

/** Link targets: a web address opens in a new tab; a link to another guide's file (like STUDIO.md) opens that guide. Anything else shows as plain text. */
export interface DocLinks { byFile: Record<string, string>; open: (id: string) => void }

function inline(text: string, links: DocLinks, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0, m: RegExpExecArray | null, n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${key}-${n++}`
    if (m[1] !== undefined) out.push(<code key={k} className="px-1.5 py-0.5 rounded bg-black/35 text-[0.92em] break-words">{m[1]}</code>)
    else if (m[2] !== undefined) out.push(<strong key={k}>{inline(m[2], links, k)}</strong>)
    else if (m[3] !== undefined) out.push(<em key={k}>{m[3]}</em>)
    else {
      const label = m[4], href = m[5]
      const file = href.split('#')[0].split('/').pop() ?? ''
      if (/^(https?:|mailto:)/i.test(href)) out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{label}</a>)
      else if (links.byFile[file]) out.push(<button key={k} type="button" onClick={() => links.open(links.byFile[file])} className="underline underline-offset-4">{label}</button>)
      else out.push(label)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

export default function DocView({ text, links }: { text: string; links: DocLinks }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  let i = 0, b = 0
  while (i < lines.length) {
    const line = lines[i], key = `b${b++}`
    if (!line.trim()) { i++; continue }

    const fence = /^\s*```/.exec(line)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++])
      i++
      nodes.push(<pre key={key} className="rounded-lg bg-black/40 p-3 text-sm overflow-x-auto"><code>{code.join('\n')}</code></pre>)
      continue
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const cls = level === 1 ? 'text-3xl font-light pt-2' : level === 2 ? 'text-2xl font-light pt-4' : 'text-xl pt-3'
      nodes.push(<div key={key} role="heading" aria-level={level} className={cls}>{inline(h[2], links, key)}</div>)
      i++
      continue
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { nodes.push(<hr key={key} className="border-white/25" />); i++; continue }

    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]))
      nodes.push(
        <div key={key} className="overflow-x-auto">
          <table className="text-sm border-collapse min-w-full">
            <thead><tr>{head.map((c, j) => <th key={j} className="text-left font-semibold px-3 py-2 border border-white/25 align-top">{inline(c, links, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="px-3 py-2 border border-white/20 align-top">{inline(c, links, `${key}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }

    if (/^\s*>/.test(line)) {
      const q: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''))
      nodes.push(<blockquote key={key} className="border-l-4 border-white/40 pl-4 opacity-90">{inline(q.join(' '), links, key)}</blockquote>)
      continue
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])!
        const depth = Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2))
        const ordered = /\d/.test(m[2])
        let body = m[3]
        i++
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) body += ' ' + lines[i++].trim() // a wrapped line
        items.push(<li key={items.length} className="flex gap-2" style={{ paddingLeft: depth * 20 }}><span aria-hidden className="opacity-70 shrink-0">{ordered ? m[2] : '•'}</span><span className="min-w-0">{inline(body, links, `${key}l${items.length}`)}</span></li>)
      }
      nodes.push(<ul key={key} className="space-y-1.5">{items}</ul>)
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|>|---+\s*$|([-*+]|\d+[.)])\s+)/.test(lines[i]) && !(isTableRow(lines[i]) && para.length === 0)) para.push(lines[i++].trim())
    if (!para.length) { para.push(lines[i++].trim()) }
    nodes.push(<p key={key}>{inline(para.join(' '), links, key)}</p>)
  }
  return <div className="space-y-3 text-base leading-relaxed break-words">{nodes}</div>
}
