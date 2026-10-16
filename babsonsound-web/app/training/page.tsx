'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'

interface Q { id: string; q: string; options: string[] }
interface Info { trained: boolean; staff: boolean; requested: boolean; certifiedAt: number | null; passPercent: number; questions: Q[] }
interface Result { passed: boolean; percent: number; passPercent: number; wrong: { id: string; why: string }[] }

export default function TrainingPage() {
  const { user, isBabson, isDeveloper, loading } = useAuth()
  const member = !!user && (isBabson || isDeveloper)
  const [info, setInfo] = useState<Info | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [requested, setRequested] = useState(false)

  useEffect(() => { if (member) apiGet<Info>('/api/training').then(i => { setInfo(i); setRequested(i.requested) }).catch(e => setError(e instanceof Error ? e.message : 'Could not load the quiz.')) }, [member])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const r = await api<Result>('/api/training', { answers })
      setResult(r)
      if (r.passed) setInfo(i => (i ? { ...i, trained: true } : i))
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not grade the quiz.') }
    setBusy(false)
  }
  async function requestTraining() {
    try { await api('/api/training/request', {}); setRequested(true) } catch (err) { setError(err instanceof Error ? err.message : 'Could not send the request.') }
  }

  if (loading) return null
  if (!member) return (
    <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">HOST TRAINING</h1>
      <p className="text-sm text-br-dk-sub">Training is for verified Babson students. <Link href="/auth" className="text-br-gold">Sign in</Link> with your Babson email.</p>
    </div>
  )
  if (!info) return <div className="max-w-2xl mx-auto px-4 py-8"><ErrorText>{error}</ErrorText></div>

  const wrongIds = new Set(result?.wrong.map(w => w.id))
  const done = info.questions.every(q => typeof answers[q.id] === 'number')

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">HOST TRAINING</h1>
        <p className="text-sm text-br-dk-sub mt-2">Pass with {info.passPercent}% or better to be certified. You can retake it as many times as you need.</p>
      </div>

      {info.trained && !result && (
        <div className="sk-raised rounded-2xl p-5 space-y-2">
          <p className="text-sm text-br-green">{info.staff ? 'Staff do not need certification.' : `You are certified${info.certifiedAt ? ` (${new Date(info.certifiedAt).toLocaleDateString()})` : ''}.`}</p>
          <Link href="/slots" className="text-sm text-br-gold">Request a slot</Link>
        </div>
      )}

      {result && (
        <div className="sk-raised rounded-2xl p-5 space-y-2">
          <p className={`text-sm ${result.passed ? 'text-br-green' : 'text-br-red'}`}>{result.passed ? `Passed with ${result.percent}%. You are certified.` : `You got ${result.percent}%. You need ${result.passPercent}%.`}</p>
          {result.passed && <Link href="/slots" className="text-sm text-br-gold">Request a slot</Link>}
        </div>
      )}

      {!info.trained && (
        <form onSubmit={submit} className="space-y-5">
          {info.questions.map((q, i) => (
            <fieldset key={q.id} className="sk-raised rounded-xl p-4 space-y-2">
              <legend className="text-sm text-br-dk-text px-1">{i + 1}. {q.q}</legend>
              {q.options.map((o, k) => (
                <label key={k} className="flex items-start gap-2 text-sm text-br-dk-text">
                  <input type="radio" name={q.id} className="mt-1" checked={answers[q.id] === k} onChange={() => setAnswers(a => ({ ...a, [q.id]: k }))} />
                  <span>{o}</span>
                </label>
              ))}
              {result && wrongIds.has(q.id) && <p className="text-xs text-br-red">{result.wrong.find(w => w.id === q.id)?.why}</p>}
            </fieldset>
          ))}
          <ErrorText>{error}</ErrorText>
          <PrimaryButton type="submit" busy={busy} disabled={!done}>SUBMIT ANSWERS</PrimaryButton>
          <div className="text-xs text-br-dk-sub">
            Prefer to learn in person?{' '}
            {requested ? 'Training requested. A director will reach out.' : <button type="button" onClick={requestTraining} className="text-br-gold underline">Request in-person training</button>}
          </div>
        </form>
      )}
    </div>
  )
}
