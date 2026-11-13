'use client'

import { useEffect, useState } from 'react'
import { SITE_VERSION_CHECK_MS, updateKind, type HelperUpdate } from '@/lib/booth'
import { errText, helper } from './helper'

// "Update available" on the idle booth, top right. Shows when a newer website is deployed or GitHub has a newer studio helper.
// Website only: reload. Helper: the helper pulls from GitHub and restarts itself (never during a live show or a recording), then the page
// waits for it to come back and reloads.

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? ''
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function UpdateButton({ helperUpdate }: { helperUpdate: HelperUpdate | null }) {
  const [liveSha, setLiveSha] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!BUILD_SHA) return
    let stop = false
    const check = () => fetch('/version.json', { cache: 'no-store' }).then(r => r.json()).then(v => { if (!stop) setLiveSha(String(v.sha || '')) }).catch(() => {})
    const first = setTimeout(check, 30_000)
    const t = setInterval(check, SITE_VERSION_CHECK_MS)
    return () => { stop = true; clearTimeout(first); clearInterval(t) }
  }, [])

  const kind = updateKind({ buildSha: BUILD_SHA, liveSha, helperBehind: helperUpdate?.behind ?? 0 })
  if (!kind && !busy) return null

  const run = async () => {
    setErr(''); setBusy(true)
    if (kind === 'site') { location.reload(); return }
    try { await helper('/update', {}) } catch (e) { setBusy(false); setErr(errText(e)); return }
    // The helper stops while it updates. Wait for the new one (nothing newer left on GitHub), then reload. Give up after 3 minutes.
    await sleep(8_000)
    for (let i = 0; i < 85; i++) {
      try { const p = await helper<{ update?: HelperUpdate }>('/ping'); if (!p.update?.updating) break } catch { /* still restarting */ }
      await sleep(2_000)
    }
    location.reload()
  }

  return (
    <div className="fixed top-4 right-6 z-[90] flex flex-col items-end gap-2">
      <button type="button" disabled={busy} onClick={run} className="gbtn h-12 px-5 text-xl">{busy ? 'Updating…' : 'Update available'}</button>
      {err && <p role="alert" className="hw-screen px-4 py-2 text-lg warn max-w-[28rem]">{err}</p>}
    </div>
  )
}
