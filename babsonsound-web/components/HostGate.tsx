'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'
import HostAgreements from '@/components/HostAgreements'

interface Q { id: string; q: string; options: string[] }
interface Info {
  trained: boolean; staff: boolean; requested: boolean; passPercent: number
  checkIn: 'none' | 'pending' | 'approved'; conductSigned: boolean; questions: Q[]
}
interface Result { passed: boolean; percent: number; passPercent: number; wrong: { id: string; why: string }[] }

const card = 'sk-raised rounded-2xl p-5 space-y-4'
const ghost = 'rounded-lg border border-br-dk-border text-br-dk-text text-sm font-semibold px-4 py-2.5 disabled:opacity-50'
const solid = 'rounded-lg bg-br-gold text-black text-sm font-semibold px-4 py-2.5 disabled:opacity-50'

/** Everything a new host does before booking: training in person, check-in, the quiz, then the four agreements.
 *  Shows `children` (the booking form) once they are certified and have signed. */
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
  if (info.trained && info.conductSigned) return <>{children}</>

  if (info.trained) {
    return (
      <div className={card}>
        <h2 className="font-display text-br-gold tracking-widest text-sm">ONE LAST STEP</h2>
        <p className="text-sm text-br-dk-text">Read and sign the host agreements.</p>
        <HostAgreements busy={busy} error={error} onSign={sig => run(() => api('/api/host/readiness', sig))} />
      </div>
    )
  }

  if (info.checkIn === 'approved' && info.questions.length) {
    const wrong = new Set(result?.wrong.map(w => w.id))
    const done = info.questions.every(q => typeof answers[q.id] === 'number')
    return (
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); void run(async () => { setResult(await api<Result>('/api/training', { answers })) }) }}>
        <div className={card}>
          <h2 className="font-display text-br-gold tracking-widest text-sm">HOST QUIZ</h2>
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
            {result && wrong.has(q.id) && <p className="text-xs text-br-red">{result.wrong.find(w => w.id === q.id)?.why}</p>}
          </fieldset>
        ))}
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy} disabled={!done}>SUBMIT ANSWERS</PrimaryButton>
      </form>
    )
  }

  return (
    <div className={card}>
      <h2 className="font-display text-br-gold tracking-widest text-sm">HOST TRAINING</h2>
      {info.checkIn === 'pending' ? (
        <>
          <p className="text-sm text-br-dk-text">Waiting for a director to confirm you are at training. This page updates on its own.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-br-dk-text">Training happens in person. Then you take a short quiz and sign the host agreements.</p>
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
