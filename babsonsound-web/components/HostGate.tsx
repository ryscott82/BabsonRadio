'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'

interface Q { id: string; q: string; options: string[] }
interface Info {
  trained: boolean; staff: boolean; requested: boolean; passPercent: number
  checkIn: 'none' | 'pending' | 'approved'; conductSigned: boolean; questions: Q[]
}
interface Result { passed: boolean; percent: number; passPercent: number; wrong: { id: string; why: string }[] }

const card = 'sk-raised rounded-2xl p-5 space-y-4'
const ghost = 'rounded-lg border border-br-dk-border text-br-dk-text text-sm font-semibold px-4 py-2.5 disabled:opacity-50'
const solid = 'rounded-lg bg-br-gold text-black text-sm font-semibold px-4 py-2.5 disabled:opacity-50'

/** Everything a new host does before booking: training in person, check-in, the quiz, (the agreements come after the request).
 *  Shows `children` (the booking form) once they are certified. */
export default function HostGate({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<Result | null>(null)

  const load = useCallback(() => apiGet<Info>('/api/training').then(setInfo).catch(e => setError(e instanceof Error ? e.message : 'Could not load.')), [])
  useEffect(() => { queueMicrotask(load) }, [load])
  // While waiting for a director to confirm, check again every few seconds.
  useEffect(() => {
    if (info?.checkIn !== 'pending') return
    const t = setInterval(() => { if (!document.hidden) void load() }, 5_000)
    return () => clearInterval(t)
  }, [info?.checkIn, load])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await fn(); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') }
    setBusy(false)
  }

  if (!info) return error ? <ErrorText>{error}</ErrorText> : null
  // The on-air agreements are signed after the show request is sent, not before.
  if (info.trained) return <>{children}</>

  if (info.checkIn === 'approved' && info.questions.length) {
    const wrong = new Set(result?.wrong.map(w => w.id))
    const done = info.questions.every(q => typeof answers[q.id] === 'number')
    return (
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); void run(async () => { setResult(await api<Result>('/api/training', { answers })) }) }}>
        <div className={card}>
          <h2 className="font-display text-br-gold tracking-widest text-sm">Host quiz</h2>
          <p className="text-sm text-br-dk-text">{info.questions.length} questions. You need {info.passPercent}% to pass, and you can retake it.</p>
          {result && !result.passed && <p className="text-sm text-br-red">You got {result.percent}%. Check the notes below and try again.</p>}
        </div>
        {info.questions.map((q, i) => (
          <fieldset key={q.id} className="sk-raised rounded-xl p-4 space-y-2">
            <legend className="text-sm text-br-dk-text px-1">{i + 1}. {q.q}</legend>
            {q.options.map((o, k) => (
              <label key={k} className="flex items-start gap-2 text-sm text-br-dk-text">
                <input type="radio" name={q.id} className="mt-1" checked={answers[q.id] === k} onChange={() => setAnswers(a => ({ ...a, [q.id]: k }))} />
                <span>{o}</span>
              </label>
            ))}
            {result && wrong.has(q.id) && <p className="text-sm text-br-red">{result.wrong.find(w => w.id === q.id)?.why}</p>}
          </fieldset>
        ))}
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy} disabled={!done}>Submit answers</PrimaryButton>
      </form>
    )
  }

  return (
    <div className={card}>
      <h2 className="font-display text-br-gold tracking-widest text-sm">Host training</h2>
      {info.checkIn === 'pending' ? (
        <>
          <p className="text-sm text-br-dk-text">Waiting for a director to confirm training.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-br-dk-text">Training is in person, then a short quiz and the host agreements.</p>
          <div className="flex flex-wrap gap-3 items-center">
            {info.requested
              ? <span className="text-sm text-br-dk-sub">Requested. A director will reach out.</span>
              : <button type="button" className={ghost} disabled={busy} onClick={() => run(() => api('/api/training/request', {}))}>Schedule a training</button>}
            <button type="button" className={solid} disabled={busy} onClick={() => run(() => api('/api/training/checkin', {}))}>I&apos;m at my training</button>
          </div>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
