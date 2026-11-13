'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { openSignIn } from '@/lib/signInPrompt'
import HostAgreements from '@/components/HostAgreements'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'

// Radio room training, taken here (the door QR leads to it after sign-up): video, quiz (every answer right), agreements, then the access form.

type Q = { id: string; q: string; options: string[] }
type Info =
  | { trained: true; formUrl: string; embed: boolean }
  | { trained: false; videoId: string; watchLeftSec: number; minWatchSec: number; passPercent: number; questions: Q[] }
type Wrong = { id: string; q: string; why: string }
type Step = 'video' | 'quiz' | 'sign' | 'form'

const title = 'font-display text-3xl tracking-[0.15em]'
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function Form({ url, embed }: { url: string; embed: boolean }) {
  return (
    <div className="space-y-4 text-center">
      <h1 className={title}>Last step</h1>
      <p>Fill in the form to get access to the radio room.</p>
      {url ? (embed
        ? <iframe src={url} title="Radio room access form" className="w-full h-[70vh] rounded-xl bg-white" />
        : <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block"><PrimaryButton type="button">Open the form</PrimaryButton></a>
      ) : <p className="opacity-80">The form isn’t set up yet. Ask a station director.</p>}
    </div>
  )
}

export default function StudioTrainingPage() {
  const { user, loading, isGuest } = useAuth()
  const [info, setInfo] = useState<Info | null>(null)
  const [step, setStep] = useState<Step>('video')
  const [left, setLeft] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [wrong, setWrong] = useState<Wrong[]>([])
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<{ url: string; embed: boolean } | null>(null)

  const [tick, setTick] = useState(0)
  const load = () => setTick(t => t + 1)

  useEffect(() => {
    if (loading || !user || isGuest) return
    let live = true
    apiGet<Info>('/api/studio/self-training').then(r => {
      if (!live) return
      setInfo(r)
      if (r.trained) setForm({ url: r.formUrl, embed: r.embed }); else setLeft(r.watchLeftSec)
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Something went wrong.') })
    return () => { live = false }
  }, [loading, user, isGuest, tick])
  useEffect(() => { const t = setInterval(() => { setNow(Date.now()); setLeft(l => Math.max(0, l - 1)) }, 1000); return () => clearInterval(t) }, [])

  const submitQuiz = async () => {
    setBusy(true); setError('')
    try {
      const r = await api<{ quizOk: boolean; wrong?: Wrong[] }>('/api/studio/self-training', { answers })
      if (r.quizOk) { setStep('sign'); setWrong([]) } else { setWrong(r.wrong ?? []); setAnswers({}); setNow(Date.now()); setRetryAt(Date.now() + 20_000); load() }
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  const sign = async (agreement: { typedName: string; accepted: true; version: string }) => {
    setBusy(true); setError('')
    try {
      const r = await api<{ formUrl: string; embed: boolean }>('/api/studio/self-training', { agreement })
      setForm({ url: r.formUrl, embed: r.embed }); setStep('form')
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }

  if (loading) return <div className="max-w-md mx-auto my-8 text-center"><p className="opacity-80">One moment…</p></div>
  if (!user) {
    return (
      <div className="max-w-md mx-auto my-8 text-center space-y-4">
        <h1 className={title}>Radio room training</h1>
        <p className="opacity-80">Create your account first, then the training starts.</p>
        <PrimaryButton type="button" onClick={() => openSignIn(true)}>Create account</PrimaryButton>
      </div>
    )
  }
  if (isGuest) return <div className="max-w-md mx-auto my-8 text-center space-y-4"><h1 className={title}>Students only</h1><p className="opacity-80">Babson, Olin and Wellesley students only.</p></div>
  if (form) return <div className="max-w-2xl mx-auto my-8"><Form {...form} /></div>
  if (!info) return <div className="max-w-md mx-auto my-8 text-center space-y-4">{error ? <><ErrorText>{error}</ErrorText><PrimaryButton type="button" onClick={() => load()}>Try again</PrimaryButton></> : <p className="opacity-80">One moment…</p>}</div>
  if (info.trained) return null

  const wait = retryAt && now ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0
  const all = info.questions.every(q => answers[q.id] !== undefined)
  return (
    <div className="max-w-xl mx-auto my-8 space-y-5">
      <h1 className={`${title} text-center`}>Radio room training</h1>
      {step === 'video' && (
        <div className="space-y-4 text-center">
          {info.videoId
            ? <div className="aspect-video"><iframe className="w-full h-full rounded-xl" src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(info.videoId)}`} title="Radio room training video" allow="encrypted-media; picture-in-picture" allowFullScreen /></div>
            : <p className="opacity-80">The training video isn’t set up yet.</p>}
          <p className="opacity-80">Watch the video, then take the quiz.</p>
          <PrimaryButton type="button" disabled={left > 0} onClick={() => setStep('quiz')}>{left > 0 ? `Quiz opens in ${mmss(left)}` : 'Take the quiz'}</PrimaryButton>
        </div>
      )}
      {step === 'quiz' && (
        <div className="space-y-5">
          <p className="text-center opacity-80">Every answer must be right.</p>
          {wrong.length > 0 && (
            <div className="sk-field rounded-xl p-4 space-y-2">
              <p className="font-display tracking-widest text-br-gold text-sm">Not quite. Check these:</p>
              {wrong.map(w => <p key={w.id} className="text-sm"><b>{w.q}</b> {w.why}</p>)}
            </div>
          )}
          {info.questions.map((q, n) => (
            <fieldset key={q.id} className="sk-field rounded-xl p-4 space-y-2">
              <legend className="px-1 text-sm font-display tracking-widest text-br-gold">{n + 1}</legend>
              <p>{q.q}</p>
              {q.options.map((o, i) => (
                <label key={i} className="flex items-start gap-2 text-sm">
                  <input type="radio" name={q.id} checked={answers[q.id] === i} onChange={() => setAnswers(a => ({ ...a, [q.id]: i }))} className="mt-0.5" />
                  <span>{o}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <ErrorText>{error}</ErrorText>
          <PrimaryButton type="button" busy={busy} disabled={!all || wait > 0} onClick={() => void submitQuiz()}>{wait > 0 ? `Try again in ${wait}s` : 'Submit'}</PrimaryButton>
        </div>
      )}
      {step === 'sign' && (
        <div className="space-y-4">
          <p className="text-center opacity-80">Perfect score. Read and sign to finish.</p>
          <HostAgreements busy={busy} error={error} onSign={sign} />
        </div>
      )}
    </div>
  )
}
