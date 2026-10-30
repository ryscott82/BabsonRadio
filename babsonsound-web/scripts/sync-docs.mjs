// Copies the project's guides into content/docs so the admin "Information and documentation" page can show them.
// Runs before every build (npm run build) and can be run by hand: npm run docs:sync.
// The list of guides is content/docs/index.json (source = path from the project root). A guide whose source is missing is left as it was.
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(web, '..')
const list = JSON.parse(readFileSync(join(web, 'content/docs/index.json'), 'utf8'))
let copied = 0
for (const d of list) {
  const from = join(root, d.source)
  if (!existsSync(from)) continue
  copyFileSync(from, join(web, 'content/docs', `${d.id}.md`))
  copied++
}
console.log(`docs: refreshed ${copied} of ${list.length} guides`)
