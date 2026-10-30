import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface DocInfo { id: string; group: string; title: string; about: string; source: string }
const dir = () => join(process.cwd(), 'content', 'docs')

/** The guides shown on the admin Information and documentation page (content/docs/index.json). */
export function docList(): DocInfo[] {
  return JSON.parse(readFileSync(join(dir(), 'index.json'), 'utf8')) as DocInfo[]
}

/** One guide's text. Only ids from the list are accepted, so nothing else on disk can be asked for. */
export function docText(id: string): { doc: DocInfo; text: string } | null {
  const doc = docList().find(d => d.id === id)
  if (!doc) return null
  try { return { doc, text: readFileSync(join(dir(), `${doc.id}.md`), 'utf8') } } catch { return null }
}
