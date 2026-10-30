import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

// Every guide listed for the admin Information and documentation page has its copy in content/docs (run npm run docs:sync if one is missing).
test('each listed guide has a file and a unique id', () => {
  const list = JSON.parse(readFileSync('content/docs/index.json', 'utf8')) as { id: string; title: string; group: string; source: string }[]
  assert.ok(list.length > 0)
  assert.equal(new Set(list.map(d => d.id)).size, list.length)
  for (const d of list) {
    assert.match(d.id, /^[a-z0-9-]+$/)
    assert.ok(d.title && d.group && d.source)
    assert.ok(existsSync(`content/docs/${d.id}.md`), `missing content/docs/${d.id}.md`)
  }
})
