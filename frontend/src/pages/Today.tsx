'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '../lib/api'
import type { Idea, Pillar, Topic } from '../types'
import TapTracker from '../components/TapTracker'
import TopicPill from '../components/TopicPill'

const GEN_STEPS = [
  { label: 'Reading your Idea Box',    delay: 0     },
  { label: 'Searching today\'s news',  delay: 4000  },
  { label: 'Selecting best topics',    delay: 13000 },
  { label: 'Ranking & finalising',     delay: 23000 },
]

export default function Today() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState(0)
  const [pendingIdea, setPendingIdea] = useState<Idea | null>(null)
  const [activePillars, setActivePillars] = useState<Pillar[]>([])
  const [genErrorDetail, setGenErrorDetail] = useState('')
  const [showErrorDetail, setShowErrorDetail] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  // Advance step indicators while generation is in flight
  useEffect(() => {
    if (!generating) { setGenStep(0); return }
    setGenStep(1)
    const timers = GEN_STEPS.slice(1).map((s, i) =>
      setTimeout(() => setGenStep(i + 2), s.delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [generating])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTopics(await api.get<Topic[]>('/topics/today'))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load topics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function pick(id: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/topics/${id}/pick`)
      router.push('/review')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Pick failed')
      setBusy(false)
    }
  }

  async function generateNow() {
    if (generating) return
    setGenerating(true)
    setError('')
    setGenErrorDetail('')
    setShowErrorDetail(false)
    setNotice('')

    // Fetch context for the summary panel (non-fatal if it fails)
    try {
      const [ideas, pillars] = await Promise.all([
        api.get<Idea[]>('/ideas'),
        api.get<Pillar[]>('/pillars'),
      ])
      setPendingIdea(ideas.find((i) => i.status === 'pending') ?? null)
      setActivePillars(pillars.filter((p) => p.active))
    } catch { /* panel stays empty — generation still proceeds */ }

    try {
      const result = await api.post<{ created?: number; skipped?: string }>('/topics/run-round')
      if (result.skipped) setNotice(`Skipped: ${result.skipped}`)
      await load()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Topic generation failed'
      setError(msg)
      setGenErrorDetail(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function rejectAll() {
    if (busy || topics.length === 0) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/topics/reject-all?round_date=${topics[0].round_date}`)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Regenerate failed')
    } finally {
      setBusy(false)
    }
  }

  // ── Loading skeleton ─────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-[54px] h-[54px] rounded-full border-4 border-border border-t-orange animate-spin mb-5" />
        <p className="text-[13px] font-medium text-muted">Loading today's topics…</p>
      </div>
    )
  }

  // ── Generating state ─────────────────────────────────────
  if (generating || (error && genErrorDetail)) {
    // Error card
    if (error && genErrorDetail) {
      return (
        <div>
          <TapTracker step={1} />
          <div className="bg-white border border-[#f3d4da] rounded-[18px] p-5 shadow-card-sm mt-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#fbe9ec] flex items-center justify-center flex-shrink-0 text-[18px]">⚠️</div>
              <div>
                <p className="text-[14px] font-bold text-text m-0 leading-snug">Topic generation failed</p>
                <p className="text-[12px] font-medium text-muted m-0 mt-[2px]">Something went wrong. You can retry or view details.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => { setError(''); setGenErrorDetail(''); generateNow() }}
                className="flex-1 bg-orange text-white rounded-[11px] py-[10px] text-[13px] font-bold border-0 cursor-pointer hover:brightness-105 transition-all"
              >
                ↻ Retry
              </button>
              <button
                onClick={() => setShowErrorDetail((v) => !v)}
                className="flex-1 bg-white border border-border text-muted rounded-[11px] py-[10px] text-[13px] font-semibold cursor-pointer hover:border-border-strong transition-colors"
              >
                {showErrorDetail ? 'Hide details' : 'View details'}
              </button>
            </div>
            {showErrorDetail && (
              <p className="mt-3 text-[11.5px] font-mono text-bad bg-[#fbe9ec] rounded-[9px] px-3 py-2 m-0 break-all">{genErrorDetail}</p>
            )}
          </div>
        </div>
      )
    }

    // Progress card
    return (
      <div>
        <TapTracker step={1} />
        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">Tap 1 of 2 · about 30 seconds</p>
        <h1 className="text-[22px] font-extrabold text-text leading-[1.18] tracking-tight m-0 mb-4">Generating today's content…</h1>

        {/* 4-step progress card */}
        <div className="bg-white border border-border rounded-[18px] p-5 shadow-card-sm mb-3">
          <div className="flex flex-col gap-[14px]">
            {GEN_STEPS.map((s, i) => {
              const stepNum = i + 1
              const done = genStep > stepNum
              const active = genStep === stepNum
              const pending = genStep < stepNum
              return (
                <div key={s.label} className="flex items-center gap-3">
                  {done && (
                    <span className="w-[22px] h-[22px] rounded-full bg-good flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">✓</span>
                  )}
                  {active && (
                    <span className="w-[22px] h-[22px] rounded-full border-[2.5px] border-orange border-t-transparent animate-spin flex-shrink-0" />
                  )}
                  {pending && (
                    <span className="w-[22px] h-[22px] rounded-full border-2 border-border flex-shrink-0" />
                  )}
                  <span className={[
                    'text-[13px] font-semibold leading-snug',
                    done ? 'text-good line-through' : active ? 'text-text' : 'text-muted',
                  ].join(' ')}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Summary panel */}
        <div className="bg-white border border-border rounded-[18px] p-5 shadow-card-sm mb-3">
          <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted mb-[12px]">What's being prepared</p>

          {pendingIdea && (
            <div className="bg-good-bg border border-good/30 rounded-[11px] px-3 py-[10px] mb-[12px]">
              <p className="text-[11px] font-bold text-good uppercase tracking-[.06em] mb-[4px]">💡 Using your idea</p>
              <p className="text-[13px] font-medium text-text m-0 leading-[1.4] line-clamp-2">"{pendingIdea.payload}"</p>
            </div>
          )}

          <div className="flex items-start gap-2 mb-[8px]">
            <span className="text-[12px] font-bold text-muted w-[110px] flex-shrink-0 pt-[1px]">Idea Source</span>
            <span className="text-[12px] font-semibold text-good">
              {pendingIdea ? '✓ 1 idea from Idea Box' : '✓ Idea Box checked'}
            </span>
          </div>

          {activePillars.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-[12px] font-bold text-muted w-[110px] flex-shrink-0 pt-[1px]">Pillars</span>
              <div className="flex flex-col gap-[3px]">
                {activePillars.map((p) => (
                  <span key={p.id} className="text-[12px] font-semibold text-good">✓ {p.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Duration + tab warning */}
        <div className="flex flex-col gap-[6px] px-1">
          <p className="text-[12px] font-semibold text-muted m-0">⏱ Usually takes 20–60 seconds</p>
          <p className="text-[11.5px] font-medium text-muted m-0">Please keep this tab open while topics are generated.</p>
        </div>
      </div>
    )
  }

  // ── No topics: empty state ────────────────────────────────
  if (topics.length === 0) {
    return (
      <div>
        <TapTracker step={1} />

        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">
          Tap 1 of 2 · about 30 seconds
        </p>
        <h1 className="text-[22px] font-extrabold text-text leading-[1.18] tracking-tight m-0 mb-1">
          Pick today's topic
        </h1>
        <p className="text-[13px] font-medium text-muted m-0 mb-5 leading-[1.5]">
          No topics yet for today. The next round runs at 09:00 IST, or generate now.
        </p>

        {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}
        {notice && <p className="text-muted text-[0.88rem] mb-3">{notice}</p>}

        <button
          onClick={generateNow}
          disabled={generating}
          className="w-full border-[1.5px] border-dashed border-border-strong bg-transparent rounded-[14px] px-4 py-[14px] text-[13px] font-semibold text-muted cursor-pointer flex items-center justify-center gap-2 transition-colors duration-150 hover:border-orange hover:text-orange-600 hover:bg-white disabled:opacity-50"
        >
          {generating ? (
            <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Generating…</>
          ) : (
            <>✦ Generate today's topics</>
          )}
        </button>
      </div>
    )
  }

  // ── Topics ready ─────────────────────────────────────────
  return (
    <div>
      <TapTracker step={1} />

      <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">
        Tap 1 of 2 · pick one
      </p>
      <h1 className="text-[22px] font-extrabold text-text leading-[1.18] tracking-tight m-0 mb-1">
        Pick today's topic
      </h1>
      <p className="text-[13px] font-medium text-muted m-0 mb-4 leading-[1.5]">
        Three ideas across your content pillars. Tap the one you want to post about.
      </p>

      {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}

      {topics.map((t) => (
        <button
          key={t.id}
          onClick={() => pick(t.id)}
          disabled={busy}
          className="w-full text-left bg-white border border-border rounded-[16px] p-4 mb-3 shadow-card-sm cursor-pointer transition-all duration-150 hover:shadow-card hover:border-border-strong active:scale-[0.985] disabled:opacity-60 relative group"
        >
          {/* Option number */}
          <span className="absolute top-[14px] right-[14px] text-[11px] font-bold text-muted">
            {t.slot}
          </span>

          {/* Pills row */}
          <div className="flex flex-wrap gap-[7px] mb-[10px] pr-8">
            {t.pillar_name && <TopicPill name={t.pillar_name} />}
            {t.is_rotation_exception && (
              <span className="inline-flex items-center gap-[5px] text-[10.5px] font-bold text-[#c2415c] bg-[#fbe9ec] px-[9px] py-[5px] rounded-[7px]">
                🔥 Urgent news
              </span>
            )}
            {t.from_idea_id && (
              <span className="inline-flex items-center gap-[5px] text-[10.5px] font-bold text-good bg-good-bg px-[9px] py-[5px] rounded-[7px]">
                💡 Your idea
              </span>
            )}
          </div>

          {/* Title + description */}
          <h3 className="text-[16px] font-bold text-text leading-[1.3] m-0 mb-[6px] tracking-[-0.01em] pr-4">
            {t.title}
          </h3>
          {t.description && (
            <p className="text-[13px] font-medium text-muted m-0 leading-[1.45] pr-4">{t.description}</p>
          )}

          {/* Signal lines */}
          {(t.is_rotation_exception || t.from_idea_id || t.pillar_name) && (
            <div className="mt-[11px] pt-[11px] border-t border-dashed border-border flex flex-col gap-[5px]">
              {t.is_rotation_exception && (
                <p className="text-[11.5px] font-semibold text-muted m-0 flex items-center gap-[7px]">
                  <span>🔥</span> Trending — competitors may be posting this now
                </p>
              )}
              {t.from_idea_id && (
                <p className="text-[11.5px] font-semibold text-muted m-0 flex items-center gap-[7px]">
                  <span>📌</span> Generated from your submitted idea
                </p>
              )}
              {!t.is_rotation_exception && !t.from_idea_id && t.pillar_name && (
                <p className="text-[11.5px] font-semibold text-muted m-0 flex items-center gap-[7px]">
                  <span>📈</span> From your {t.pillar_name.toLowerCase()} pillar
                </p>
              )}
            </div>
          )}

          {/* Tap indicator */}
          <div className="absolute right-[14px] bottom-[14px] w-[28px] h-[28px] rounded-full bg-bg flex items-center justify-center text-text transition-colors duration-150 group-hover:bg-orange group-hover:text-white text-[13px]">
            →
          </div>
        </button>
      ))}

      {/* Ghost regenerate button */}
      <button
        onClick={rejectAll}
        disabled={busy}
        className="w-full border-[1.5px] border-dashed border-border-strong bg-transparent rounded-[14px] px-4 py-[13px] mt-[2px] text-[13px] font-semibold text-muted cursor-pointer flex items-center justify-center gap-2 transition-colors duration-150 hover:border-orange hover:text-orange-600 hover:bg-white disabled:opacity-50"
      >
        ↻ Show me different topics
      </button>
    </div>
  )
}
