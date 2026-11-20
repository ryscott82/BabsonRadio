'use client'

import { setlistsCsv, type SetListItem } from '@/lib/setlistsFor'

// The set lists hosts entered for one show, inside that show's entry on the schedule page. Collapsed until opened.
export default function ShowSetLists({ items, label }: { items: SetListItem[]; label: string }) {
  function download() {
    const url = URL.createObjectURL(new Blob([setlistsCsv(items)], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'show'}-set-lists.csv`; a.click(); URL.revokeObjectURL(url)
  }
  if (!items.length) return null
  return (
    <details className="basis-full text-sm">
      <summary className="cursor-pointer text-xs text-br-gold min-h-11 flex items-center">Set lists ({items.length})</summary>
      <div className="space-y-2 pb-2">
        {items.map(i => (
          <div key={i.id} className="sk-field rounded-lg p-3">
            <p className="text-xs text-br-dk-sub">{new Date(i.startAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {i.songCount} songs</p>
            <pre className="mt-1 text-xs text-br-dk-text whitespace-pre-wrap font-sans">{i.songs || '(empty)'}</pre>
          </div>
        ))}
        <button type="button" onClick={download} className="sk-btn font-display tracking-widest text-xs px-4 py-2 rounded-lg">Download csv</button>
      </div>
    </details>
  )
}
