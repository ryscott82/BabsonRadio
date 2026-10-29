import test from 'node:test'
import assert from 'node:assert/strict'
import { cdata, escXml, intOr0, safeUrl } from './xml.ts'

test('escXml escapes markup and quotes, so attribute values cannot break out', () => {
  assert.equal(escXml(`a & b < c > "d" 'e'`), 'a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;')
  assert.equal(escXml(`https://x.test/a.jpg" onerror="x`), 'https://x.test/a.jpg&quot; onerror=&quot;x')
  assert.equal(escXml(null), '')
  assert.equal(escXml('ok\u0000\u0008text'), 'oktext')
})

test('cdata splits "]]>" so the section cannot end early', () => {
  const out = cdata('x ]]><script>alert(1)</script>')
  assert.equal(out, '<![CDATA[x ]]]]><![CDATA[><script>alert(1)</script>]]>')
  // read back: joining the sections gives the original text, and no raw "]]>" appears inside a section
  const inner = out.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').replace(']]]]><![CDATA[>', ']]>')
  assert.equal(inner, 'x ]]><script>alert(1)</script>')
  assert.equal(cdata(undefined), '<![CDATA[]]>')
})

test('numbers and urls', () => {
  assert.equal(intOr0('12abc'), 0)
  assert.equal(intOr0(7.9), 7)
  assert.equal(intOr0(-3), 0)
  assert.equal(intOr0('</itunes:episode><x>'), 0)
  assert.equal(safeUrl('javascript:alert(1)'), '')
  assert.equal(safeUrl('https://example.com/a b.jpg'), 'https://example.com/a%20b.jpg')
  assert.equal(safeUrl(undefined), '')
})
