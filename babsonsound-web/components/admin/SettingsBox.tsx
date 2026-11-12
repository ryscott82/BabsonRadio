'use client'

import { useMemo, useState } from 'react'
import SettingRow from './SettingRow'
import ConfirmDialog from './ConfirmDialog'
import { useServerSettings } from './useServerSettings'
import { LISTENING_LABEL, toRow } from '@/lib/settingsDefs'
import { changedRows, guestsDiffer, guestsFollowStudents, listeningChanges, resetAllBody, resetAllText, splitRows, statusLine, type Row } from '@/lib/settingsGroups'
import type { SettingDef, SettingValue } from '@/lib/settingRow'

/**
 * The settings that belong on one page: the few that matter as cards, then a closed Expert fold with the rest. A status line says whether everything is
 * on the recommended settings, with Reset all (a confirm box names who is affected). Admins only: render it only for an Admin, so E-board never sees it.
 * `listening` adds the "different limits for guests" switch (off unless students and guests already differ).
 */
export default function SettingsBox({ title, accept, foldTitle = 'Expert settings (you almost never need these)', focus = '', listening = false, status = true, onSaved }: {
  title?: string; accept: (key: string) => boolean; foldTitle?: string; focus?: string; listening?: boolean; status?: boolean; onSaved?: () => void
}) {
  const { list, error, patch } = useServerSettings(true)
  const [separate, setSeparate] = useState<boolean | null>(null) // null: decide from the stored values once they have loaded
  const [asking, setAsking] = useState<'reset' | 'guests' | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)

  const rows: Row[] = useMemo(() => (list ?? []).filter(s => accept(s.key)).map(toRow), [list, accept])
  const get = (k: string): SettingValue | undefined => rows.find(r => r.def.id === k)?.value
  const { main, expert } = splitRows(rows)
  const sep = separate ?? (list ? guestsDiffer(get) : false)
  const inExpert = !!focus && expert.some(r => r.def.id === focus)
  const changed = changedRows(rows)

  const save = async (changes: Record<string, SettingValue | null>) => { await patch(changes); onSaved?.() }
  async function confirm() {
    setBusy(true); setErr('')
    try {
      if (asking === 'reset') await save(resetAllBody(rows).changes)
      if (asking === 'guests') { await save(guestsFollowStudents(get)); setSeparate(false) }
      setAsking(null)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  const relabel = (def: SettingDef): SettingDef => {
    const name = def.id.split('.').pop() ?? ''
    return listening && LISTENING_LABEL[name] ? { ...def, label: LISTENING_LABEL[name] } : def
  }
  const card = (r: Row) => (
    <SettingRow key={r.def.id} def={relabel(r.def)} value={r.value} highlight={focus === r.def.id}
                meta={{ changedAt: r.changedAt, changedBy: r.changedBy }}
                onSave={v => save(listening ? listeningChanges(r.def.id, v, sep) : { [r.def.id]: v })} />
  )

  if (error) return <p role="alert" className="ops-card p-4 text-base">{error}</p>
  if (!list) return <div className="ops-card min-h-[180px] p-4 motion-safe:animate-pulse" aria-hidden />

  const sharedMain = main.filter(r => /\.(idleMin|sessionMaxMin|quietEnabled|quietStart|quietEnd)$/.test(r.def.id))
  const studentRows = sharedMain.filter(r => r.def.id.startsWith('limits.student.'))
  const guestRows = sharedMain.filter(r => r.def.id.startsWith('limits.guest.'))
  const otherMain = main.filter(r => !sharedMain.includes(r))
  const grid = 'grid lg:grid-cols-2 gap-4'

  return (
    <section aria-label={title ?? 'Settings'} className="space-y-4">
      {title && <h2 className="text-3xl font-light">{title}</h2>}
      {status && (
        <div className="ops-card p-4 flex flex-wrap items-center gap-3" role="status">
          <p className="text-base flex-1 min-w-[200px]">{statusLine(changed.length)}</p>
          {changed.length > 0 && <button type="button" className="ops-btn px-4 min-h-11" onClick={() => { setErr(''); setAsking('reset') }}>Reset all to recommended</button>}
        </div>
      )}
      {err && !asking && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-2">{err}</p>}

      {listening ? (
        <>
          <div className={grid}>{studentRows.map(card)}</div>
          <div className="ops-card p-4 space-y-2">
            <label className="flex items-center gap-3 text-base min-h-11">
              <input type="checkbox" className="h-6 w-6" checked={sep} onChange={e => { if (e.target.checked) setSeparate(true); else if (Object.keys(guestsFollowStudents(get)).length) setAsking('guests'); else setSeparate(false) }} />
              Use different limits for guests
            </label>
            <p className="text-base opacity-90">{sep ? 'Guests have their own copy of these limits below.' : 'Off: guests get the same limits as students, and every save here applies to both.'}</p>
          </div>
          {sep && <><h3 className="text-xl font-light">Guests</h3><div className={grid}>{guestRows.map(card)}</div></>}
        </>
      ) : null}
      {otherMain.length > 0 && <div className={grid}>{otherMain.map(card)}</div>}

      {expert.length > 0 && (
        <div className="space-y-3">
          <button type="button" className="ops-btn px-4 min-h-11" aria-expanded={open || inExpert} onClick={() => setOpen(o => !o)}>{open || inExpert ? 'Hide' : 'Show'} {foldTitle}</button>
          {(open || inExpert) && <div className={grid}>{expert.map(card)}</div>}
        </div>
      )}

      {asking === 'reset' && (
        <ConfirmDialog title={resetAllText(rows).title} body={resetAllText(rows).body} action="Reset them" busy={busy} onNo={() => setAsking(null)} onYes={confirm} />
      )}
      {asking === 'guests' && (
        <ConfirmDialog title="Give guests the student limits?" body="Guests get the same still-listening, stop-after and sleep-hour values as students, and their own values are replaced. Every guest listening is affected." action="Use the same limits" busy={busy} onNo={() => setAsking(null)} onYes={confirm} />
      )}
    </section>
  )
}
