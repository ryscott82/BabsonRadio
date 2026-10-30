// Run with:  npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanFormUrl } from './studioForm.ts'

test('Microsoft Forms links are accepted and made embeddable', () => {
  assert.equal(cleanFormUrl(' https://forms.office.com/r/AbC123 '), 'https://forms.office.com/r/AbC123?embed=true')
  assert.equal(cleanFormUrl('https://forms.office.com/Pages/ResponsePage.aspx?id=xyz'), 'https://forms.office.com/Pages/ResponsePage.aspx?id=xyz&embed=true')
  assert.equal(cleanFormUrl('https://forms.cloud.microsoft/r/AbC123?embed=true'), 'https://forms.cloud.microsoft/r/AbC123?embed=true')
})

test('anything else is refused', () => {
  for (const bad of ['', 'forms.office.com/r/x', 'http://forms.office.com/r/x', 'https://evil.com/r/x', 'https://forms.office.com.evil.com/r/x', 'https://user:pw@forms.office.com/r/x', 'javascript:alert(1)', null, 5])
    assert.equal(cleanFormUrl(bad as string), null, String(bad))
})
