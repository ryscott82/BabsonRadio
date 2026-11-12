import test from 'node:test'
import assert from 'node:assert/strict'
import { describeChange, hasMore, historyUrl, mergePage, PAGE_SIZE, type HistoryLine } from './settingsHistory.ts'

const line = (id: string, at: number): HistoryLine => ({ id, at, by: 'a@babson.edu', key: 'auto.learn', label: 'Learn', old: true, new: false })

test('the first page has no cursor; the next page passes the last `next` as before', () => {
  assert.equal(historyUrl(null), `/api/admin/settings/history?limit=${PAGE_SIZE}`)
  assert.equal(historyUrl(1234), `/api/admin/settings/history?limit=${PAGE_SIZE}&before=1234`)
  assert.equal(historyUrl(null, 10), '/api/admin/settings/history?limit=10')
})

test('paging appends older lines and keeps a repeated line once', () => {
  const first = [line('c', 30), line('b', 20)]
  const merged = mergePage(first, { lines: [line('b', 20), line('a', 10)], next: null })
  assert.deepEqual(merged.map(l => l.id), ['c', 'b', 'a'])
})

test('Show older appears only while the server gave a next cursor', () => {
  assert.equal(hasMore(20), true)
  assert.equal(hasMore(null), false)
})

test('a change reads in plain words', () => {
  assert.equal(describeChange(line('x', 1)), 'On to Off')
  assert.equal(describeChange({ ...line('x', 1), old: 30, new: 60 }), '30 to 60')
})
