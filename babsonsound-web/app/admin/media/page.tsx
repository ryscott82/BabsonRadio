'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet, apiUpload } from '@/lib/auth'
import { CHUNK_BYTES, MB, chunkCount, fileProblem, type UploadLimits, type UploadUsage } from '@/lib/uploads'

interface Playlist { id: number; name: string }
interface State { limits: UploadLimits; usage: UploadUsage; cpuPct: number }
interface Overview { configured: boolean; playlists?: Playlist[]; state?: State }
interface MediaFile { id: number; path: string; title: string; artist: string; playlists: { id: number; name: string }[] }
interface Library { total: number; matches: number; files: MediaFile[]; folders: string[] }
interface Job { key: string; file: File; status: 'waiting' | 'uploading' | 'finishing' | 'done' | 'error'; pct: number; note: string }

const mb = (n: number) => `${Math.round((n / MB) * 10) / 10} MB`
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// Admin only: add music to the station's library, choose its folder and playlists, and see how much of the site's allowance uploads have used.
export default function MediaPage() {
  const { isAdmin, loading } = useAuth()
  const [ov, setOv] = useState<Overview | null>(null)
  const [lib, setLib] = useState<Library | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [dir, setDir] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [jobs, setJobs] = useState<Job[]>([])
  const [running, setRunning] = useState(false)
  const stop = useRef(false)
  const [q, setQ] = useState('')
  const [folder, setFolder] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editSet, setEditSet] = useState<Set<number>>(new Set())
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [lim, setLim] = useState<UploadLimits | null>(null)
  const [busy, setBusy] = useState(false)

  const loadOverview = useCallback(() => apiGet<Overview>('/api/admin/media').then(r => { setOv(r); if (r.state) setLim(cur => cur ?? r.state!.limits) }).catch(e => setErr((e as Error).message)), [])
  const loadLibrary = useCallback(() => apiGet<Library>(`/api/admin/media?view=files&q=${encodeURIComponent(q)}&folder=${encodeURIComponent(folder)}`).then(setLib).catch(e => setErr((e as Error).message)), [q, folder])
  useEffect(() => { if (isAdmin) queueMicrotask(loadOverview) }, [isAdmin, loadOverview])
  useEffect(() => {
    if (!isAdmin || !ov?.configured) return
    const t = setTimeout(loadLibrary, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [isAdmin, ov?.configured, loadLibrary, q])

  const limits = ov?.state?.limits
  const usage = ov?.state?.usage
  const playlists = useMemo(() => ov?.playlists ?? [], [ov])
  const patchJob = (key: string, p: Partial<Job>) => setJobs(js => js.map(j => (j.key === key ? { ...j, ...p } : j)))

  function addFiles(list: FileList | null) {
    if (!list || !limits) return
    const bad: string[] = []
    const add: Job[] = []
    for (const f of Array.from(list)) {
      const p = fileProblem(f.name, f.size, limits)
      if (p) bad.push(p); else add.push({ key: newId(), file: f, status: 'waiting', pct: 0, note: '' })
    }
    setErr(bad.join(' '))
    setJobs(js => [...js, ...add])
  }

  async function sendOne(job: Job) {
    const f = job.file, total = chunkCount(f.size), id = newId()
    patchJob(job.key, { status: 'uploading', pct: 0, note: '' })
    let warn = ''
    for (let i = 0; i < total; i++) {
      if (stop.current) throw new Error('Stopped.')
      const form = new FormData()
      form.set('part', f.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES), f.name)
      form.set('name', f.name); form.set('dir', dir); form.set('index', String(i)); form.set('total', String(total)); form.set('totalSize', String(f.size)); form.set('id', id)
      let tries = 0
      for (;;) {
        try {
          const r = await apiUpload<{ done: boolean; warn?: string }>('/api/admin/media/chunk', form)
          if (r.warn) warn = r.warn
          break
        } catch (e) {
          const m = (e as Error).message
          // Only a lost connection is worth another try; a refusal (limits, permissions) is final.
          if (++tries > 2 || !/reach Babson Radio/i.test(m)) throw e
        }
      }
      patchJob(job.key, { pct: Math.round(((i + 1) / total) * 100) })
    }
    patchJob(job.key, { status: 'finishing' })
    const path = dir ? `${dir}/${f.name}` : f.name
    let note = warn
    if (picked.size) {
      try { await api('/api/admin/media', { action: 'playlists', path, playlistIds: [...picked] }) }
      catch (e) { note = `Uploaded. ${(e as Error).message}` }
    }
    patchJob(job.key, { status: 'done', pct: 100, note })
  }

  async function start() {
    setErr(''); setMsg(''); stop.current = false; setRunning(true)
    for (const j of jobs.filter(x => x.status === 'waiting' || x.status === 'error')) {
      if (stop.current) break
      try { await sendOne(j) } catch (e) { patchJob(j.key, { status: 'error', note: (e as Error).message }); if (/limit|paused|switched off/i.test((e as Error).message)) break }
    }
    setRunning(false)
    loadOverview(); loadLibrary()
  }

  async function savePlaylists(m: MediaFile) {
    setBusy(true); setErr(''); setMsg('')
    try { await api('/api/admin/media', { action: 'playlists', mediaId: m.id, playlistIds: [...editSet] }); setMsg('Playlists saved.'); setEditing(null); loadLibrary() }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  async function remove(m: MediaFile) {
    setBusy(true); setErr(''); setMsg('')
    try { await api('/api/admin/media', { action: 'delete', mediaId: m.id, label: m.path }); setMsg('Deleted.'); setConfirmDel(null); loadLibrary() }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  async function saveLimits() {
    if (!lim) return
    setBusy(true); setErr(''); setMsg('')
    try { await api('/api/admin/media', { action: 'limits', ...lim }); setMsg('Limits saved.'); loadOverview() }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  if (loading || !isAdmin) return <div className="min-h-[60vh]" />
  const card = 'ops-card p-5 space-y-4 min-w-0', btn = 'ops-btn px-4 py-2 disabled:opacity-50', field = 'ops-field w-full'
  const pct = (n: number, of: number) => Math.min(100, Math.round((n / Math.max(1, of)) * 100))
  const meter = (label: string, used: string, of: string, p: number) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums">{used} of {of}</span></div>
      <div className="h-2.5 bg-black/35 rounded-full overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-white" style={{ width: `${p}%`, opacity: p >= 80 ? 1 : 0.75 }} />
      </div>
    </div>
  )
  const waiting = jobs.filter(j => j.status === 'waiting' || j.status === 'error').length

  return (
    <div className="ops-hub">
      <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-6">
        <header>
          <h1 className="text-4xl font-light leading-tight">Music uploads</h1>
          <p className="text-base opacity-90 mt-1">Add .mp3 files to the radio library, choose their folder and playlists, and keep an eye on the site&apos;s allowance.</p>
        </header>
        {err && <p role="alert" className="ops-card p-4">{err}</p>}
        {msg && <p role="status" className="ops-card p-4">{msg}</p>}
        {ov && !ov.configured && <p className="ops-card p-4">The radio is not connected, so there is no library to show.</p>}

        {ov?.configured && limits && usage && (<>
          <section className={card} aria-label="Upload allowance">
            <h2 className="text-2xl font-light">Upload allowance this month</h2>
            <p className="text-base opacity-90">Every 3 MB piece of an upload passes through the site once. Uploads stop by themselves when a limit below is reached or the site is close to its monthly server time, so they can never pause the site.</p>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              {meter('Data this month', mb(usage.bytes), `${limits.monthlyMB} MB`, pct(usage.bytes, limits.monthlyMB * MB))}
              {meter('Data today', mb(usage.todayBytes), `${limits.dailyMB} MB`, pct(usage.todayBytes, limits.dailyMB * MB))}
              {meter('Server calls this month', String(usage.calls), String(limits.monthlyCalls), pct(usage.calls, limits.monthlyCalls))}
              {meter('Site server time (all features)', `${ov.state!.cpuPct}%`, `${limits.pauseAtCpuPct}% pause point`, pct(ov.state!.cpuPct, limits.pauseAtCpuPct))}
            </div>
            <p className="text-sm opacity-80">{usage.files} files uploaded this month. {!limits.enabled && 'Uploads are switched off.'}</p>
            <details>
              <summary className="cursor-pointer text-base underline underline-offset-4">Upload limits</summary>
              {lim && (
                <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-end">
                  <label className="flex items-center gap-2 text-base"><input type="checkbox" checked={lim.enabled} onChange={e => setLim({ ...lim, enabled: e.target.checked })} /> Uploads on</label>
                  {([['monthlyMB', 'Data per month (MB)'], ['dailyMB', 'Data per day (MB)'], ['monthlyCalls', 'Server calls per month'], ['maxFileMB', 'Biggest song (MB)'], ['pauseAtCpuPct', 'Pause at this % of site server time']] as const).map(([k, label]) => (
                    <label key={k} className="text-sm space-y-1 block">{label}
                      <input type="number" className={field} value={lim[k]} onChange={e => setLim({ ...lim, [k]: Number(e.target.value) })} /></label>
                  ))}
                  <button type="button" className={btn} disabled={busy} onClick={saveLimits}>Save limits</button>
                </div>
              )}
            </details>
          </section>

          <section className={card} aria-label="Upload music">
            <h2 className="text-2xl font-light">Add music</h2>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="text-sm space-y-1 block">Folder (leave empty for the top of the library, or type a new one)
                  <input className={field} value={dir} onChange={e => setDir(e.target.value)} list="media-folders" placeholder="For example: Rock/90s" maxLength={200} /></label>
                <datalist id="media-folders">{(lib?.folders ?? []).map(f => <option key={f} value={f} />)}</datalist>
                <label className="text-sm space-y-1 block">.mp3 files (up to {limits.maxFileMB} MB each)
                  <input type="file" accept=".mp3,audio/mpeg" multiple disabled={running} onChange={e => { addFiles(e.target.files); e.target.value = '' }} className={field} /></label>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm">Add to these playlists</legend>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 max-h-52 overflow-y-auto">
                  {playlists.map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-base">
                      <input type="checkbox" checked={picked.has(p.id)} onChange={e => setPicked(s => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n })} />{p.name}
                    </label>
                  ))}
                  {!playlists.length && <p className="text-sm opacity-80">No playlists found. Files will go into the library only.</p>}
                </div>
              </fieldset>
            </div>
            {jobs.length > 0 && (
              <ul className="divide-y divide-white/25">
                {jobs.map(j => (
                  <li key={j.key} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="min-w-0 truncate flex-1">{j.file.name} <span className="text-sm opacity-80">{mb(j.file.size)}</span></span>
                    <span className="text-sm tabular-nums">{j.status === 'waiting' ? 'Waiting' : j.status === 'uploading' ? `Uploading ${j.pct}%` : j.status === 'finishing' ? 'Adding to playlists' : j.status === 'done' ? 'Done' : 'Failed'}</span>
                    {j.note && <span className="text-sm basis-full opacity-90">{j.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="button" className={btn} disabled={running || !waiting || !limits.enabled} onClick={start}>{running ? 'Uploading…' : `Upload ${waiting || ''} ${waiting === 1 ? 'file' : 'files'}`}</button>
              {running && <button type="button" className={btn} onClick={() => { stop.current = true }}>Stop after this piece</button>}
              {!running && jobs.length > 0 && <button type="button" className={btn} onClick={() => setJobs(js => js.filter(j => j.status === 'waiting' || j.status === 'error'))}>Clear finished</button>}
            </div>
          </section>

          <section className={card} aria-label="Library">
            <h2 className="text-2xl font-light">Library{lib ? <span className="text-base opacity-80"> ({lib.total} files)</span> : null}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <input className={field} value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, artist or file name" aria-label="Search the library" />
              <select className={field} value={folder} onChange={e => setFolder(e.target.value)} aria-label="Folder">
                <option value="">All folders</option>
                {(lib?.folders ?? []).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            {lib && lib.matches > lib.files.length && <p className="text-sm opacity-80">Showing the first {lib.files.length} of {lib.matches}. Search to narrow it down.</p>}
            <ul className="divide-y divide-white/25">
              {(lib?.files ?? []).map(m => (
                <li key={m.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg">{m.title || m.path.split('/').pop()}{m.artist ? <span className="opacity-80"> · {m.artist}</span> : null}</p>
                      <p className="text-sm opacity-80 truncate">{m.path}</p>
                      <p className="text-sm">{m.playlists.length ? m.playlists.map(p => p.name || playlists.find(x => x.id === p.id)?.name || `#${p.id}`).join(', ') : 'Not in any playlist'}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" className={btn} onClick={() => { setEditing(editing === m.id ? null : m.id); setEditSet(new Set(m.playlists.map(p => p.id))); setConfirmDel(null) }}>Playlists</button>
                      {confirmDel === m.id
                        ? <button type="button" className="ops-btn-red px-4 py-2" disabled={busy} onClick={() => remove(m)}>Delete for good</button>
                        : <button type="button" className={btn} onClick={() => { setConfirmDel(m.id); setEditing(null) }}>Delete</button>}
                    </div>
                  </div>
                  {editing === m.id && (
                    <div className="space-y-2 pl-1">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                        {playlists.map(p => (
                          <label key={p.id} className="flex items-center gap-2 text-base">
                            <input type="checkbox" checked={editSet.has(p.id)} onChange={e => setEditSet(s => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n })} />{p.name}
                          </label>
                        ))}
                      </div>
                      <button type="button" className={btn} disabled={busy} onClick={() => savePlaylists(m)}>Save playlists</button>
                    </div>
                  )}
                </li>
              ))}
              {lib && !lib.files.length && <li className="py-3 opacity-80">Nothing matches.</li>}
              {!lib && <li className="py-3 opacity-80">Loading…</li>}
            </ul>
          </section>
        </>)}
        {!ov && !err && <p className="opacity-80">Loading…</p>}
      </div>
    </div>
  )
}
