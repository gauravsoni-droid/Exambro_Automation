'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, ApiError } from '../lib/api'
import type { Idea, Pillar, Post, Topic, TopicDecisionTrace } from '../types'
import TapTracker from '../components/TapTracker'
import TopicPill from '../components/TopicPill'
import SegControl from '../components/SegControl'

// Statuses where a post is actively being worked on and the user needs /review.
// Mirrors IN_FLIGHT in backend/app/api/posts.py.
const IN_FLIGHT_STATUSES = new Set<string>([
  'topic_chosen', 'generating', 'content_ready', 'awaiting_approval',
])

const FORMAT_OPTIONS = [
  { label: 'Post',   value: 'post' },
  { label: 'Reel',   value: 'reel' },
  { label: 'Auto',   value: 'auto' },
]

const GEN_STEPS = [
  { label: 'Reading your Idea Box',   delay: 0     },
  { label: "Searching today's news",  delay: 4000  },
  { label: 'Selecting best topics',   delay: 13000 },
  { label: 'Ranking & finalising',    delay: 23000 },
]

function ConfidenceDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-[4px]">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${n <= level ? 'bg-orange' : 'bg-border'}`}
        />
      ))}
    </div>
  )
}

function topicConfidence(t: Topic): { label: string; level: 1 | 2 | 3; reason: string } {
  if (t.from_idea_id)
    return { label: 'Your request', level: 3, reason: 'Derived from your submitted idea' }
  if (t.is_rotation_exception)
    return { label: 'Trending signal', level: 3, reason: 'Trending exam topic — high relevance today' }
  return {
    label: 'Pillar match',
    level: 2,
    reason: `Aligned with your ${t.pillar_name?.toLowerCase() ?? 'content'} pillar strategy`,
  }
}

const TRACE_SIGNALS: { key: keyof TopicDecisionTrace; label: string; icon: string }[] = [
  { key: 'owner_idea',          label: 'Your idea',            icon: '💡' },
  { key: 'breaking_news',       label: 'Breaking news',        icon: '🔥' },
  { key: 'adaptive_strategy',   label: 'Adaptive strategy',    icon: '📅' },
  { key: 'performance_signal',  label: 'Performance learning', icon: '📈' },
  { key: 'competitor_signal',   label: 'Competitor analysis',  icon: '🔍' },
  { key: 'business_foundation', label: 'Business foundation',  icon: '🏢' },
]

function TraceModal({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const trace: TopicDecisionTrace = topic.decision_trace!
  const phaseLabel = trace.exam_phase
    ? trace.exam_phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-[20px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[.12em] text-muted m-0">
              Decision trace
            </p>
            <h2 className="text-[17px] font-extrabold text-text m-0 mt-[3px] leading-[1.2]">
              Why this topic?
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-bg flex items-center justify-center text-muted text-[14px] border-0 cursor-pointer hover:bg-border transition-colors flex-shrink-0 mt-[2px]"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pt-4 pb-1 space-y-[18px] max-h-[55vh] overflow-y-auto">
          {/* Pillar */}
          {trace.pillar_name && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted m-0 mb-[7px]">
                Selected pillar
              </p>
              <div className="flex items-center gap-[8px]">
                <span className="w-[8px] h-[8px] rounded-full bg-orange flex-shrink-0" />
                <span className="text-[14px] font-bold text-text">{trace.pillar_name}</span>
              </div>
            </div>
          )}

          {/* Reasons */}
          {trace.selection_reasons.length > 0 && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted m-0 mb-[8px]">
                Why this was chosen
              </p>
              <div className="flex flex-col gap-[8px]">
                {trace.selection_reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-[8px]">
                    <span className="text-orange font-black text-[12px] mt-[2px] flex-shrink-0 leading-none">•</span>
                    <span className="text-[12.5px] font-medium text-text leading-[1.45]">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active signals */}
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted m-0 mb-[8px]">
              Signals active
            </p>
            <div className="flex flex-col gap-[7px]">
              {TRACE_SIGNALS.map(({ key, label, icon }) => {
                const active = Boolean(trace[key])
                return (
                  <div key={String(key)} className="flex items-center gap-[9px]">
                    <span className={`text-[12px] font-bold w-[14px] flex-shrink-0 ${active ? 'text-good' : 'text-border-strong'}`}>
                      {active ? '✓' : '–'}
                    </span>
                    <span className="text-[12px] flex-shrink-0">{icon}</span>
                    <span className={`text-[12.5px] font-semibold ${active ? 'text-text' : 'text-muted'}`}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Exam phase */}
          {phaseLabel && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted m-0 mb-[7px]">
                Exam phase
              </p>
              <span className="inline-block bg-bg border border-border text-[12.5px] font-bold text-text px-3 py-[5px] rounded-[9px]">
                {phaseLabel}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border mt-1">
          <p className="text-[11px] font-medium text-muted m-0 text-center leading-snug">
            Signals shaped this topic, not the post content.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Today() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genComplete, setGenComplete] = useState(false)
  const [genStep, setGenStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const genStartRef = useRef<number | null>(null)
  const [pendingIdea, setPendingIdea] = useState<Idea | null>(null)
  const [activePillars, setActivePillars] = useState<Pillar[]>([])
  const [genErrorDetail, setGenErrorDetail] = useState('')
  const [showErrorDetail, setShowErrorDetail] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [selectedFormat, setSelectedFormat] = useState('auto')
  const [activePost, setActivePost] = useState<Post | null>(null)
  const [traceModal, setTraceModal] = useState<Topic | null>(null)
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

  // Elapsed time counter — ticks every second while generating
  useEffect(() => {
    if (!generating) { setElapsed(0); genStartRef.current = null; return }
    genStartRef.current = Date.now()
    const iv = setInterval(() => {
      if (genStartRef.current)
        setElapsed(Math.floor((Date.now() - genStartRef.current) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [generating])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fetchedTopics, currentPost] = await Promise.all([
        api.get<Topic[]>('/topics/today'),
        api.get<Post | null>('/posts/current').catch(() => null),
      ])
      setTopics(fetchedTopics)
      setActivePost(currentPost)
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
    setPickedId(id)
    setError('')
    try {
      await api.post(`/topics/${id}/pick?format=${selectedFormat}`)
      router.push('/review')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Pick failed')
      setBusy(false)
      setPickedId(null)
    }
  }

  async function generateNow() {
    if (generating) return
    setGenerating(true)
    setError('')
    setGenErrorDetail('')
    setShowErrorDetail(false)
    setNotice('')
    setGenComplete(false)

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
      if (result.skipped === 'suggested topics already exist for today') {
        setNotice("Today's topics are already available.")
      } else if (result.skipped) {
        setNotice(`Skipped: ${result.skipped}`)
      } else {
        setNotice('New topics generated.')
      }
      await load()
      setGenerating(false)
      setGenComplete(true)
      setTimeout(() => setGenComplete(false), 1500)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Topic generation failed'
      setError(msg)
      setGenErrorDetail(msg)
      setGenerating(false)
    }
  }

  async function rejectAll() {
    if (busy || topics.length === 0) return
    setBusy(true)
    setRegenerating(true)
    setError('')
    try {
      await api.post(`/topics/reject-all?round_date=${topics[0].round_date}`)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Regenerate failed')
    } finally {
      setBusy(false)
      setRegenerating(false)
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

  // ── Completion flash ─────────────────────────────────────
  if (genComplete) {
    return (
      <div>
        <TapTracker step={1} />
        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">
          Tap 1 of 2 · topics ready
        </p>
        <h1 className="text-[22px] font-extrabold text-text leading-[1.18] tracking-tight m-0 mb-4">
          Topics ready
        </h1>
        <div className="bg-white border border-good/40 rounded-[18px] p-5 shadow-card-sm">
          <div className="flex flex-col gap-[14px]">
            {GEN_STEPS.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-[22px] h-[22px] rounded-full bg-good flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">✓</span>
                <span className="text-[13px] font-semibold text-good line-through leading-snug">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border text-center">
            <p className="text-[14px] font-bold text-text m-0">Topics ready — pick one below</p>
          </div>
        </div>
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
    const elapsedLabel = elapsed > 0 ? `${elapsed}s elapsed` : 'about 30 seconds'
    return (
      <div>
        <TapTracker step={1} />
        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">
          Tap 1 of 2 · {elapsedLabel}
        </p>
        <h1 className="text-[22px] font-extrabold text-text leading-[1.18] tracking-tight m-0 mb-4">
          {selectedFormat === 'post' ? 'Generating Image Post…'
            : selectedFormat === 'reel' ? 'Generating Reel…'
            : 'AI choosing best format…'}
        </h1>

        {/* 4-step progress card */}
        <div className="bg-white border border-border rounded-[18px] p-5 shadow-card-sm mb-3">
          <div className="flex flex-col gap-[14px]">
            {GEN_STEPS.map((s, i) => {
              const stepNum = i + 1
              const done   = genStep > stepNum
              const active = genStep === stepNum
              const pending = genStep < stepNum
              return (
                <div key={s.label} className="flex items-center gap-3">
                  {done    && <span className="w-[22px] h-[22px] rounded-full bg-good flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">✓</span>}
                  {active  && <span className="w-[22px] h-[22px] rounded-full border-[2.5px] border-orange border-t-transparent animate-spin flex-shrink-0" />}
                  {pending && <span className="w-[22px] h-[22px] rounded-full border-2 border-border flex-shrink-0" />}
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

        {/* Duration hint */}
        <div className="px-1 mb-2">
          <p className="text-[12px] font-semibold text-muted m-0">⏱ Usually takes 20–60 seconds</p>
        </div>

        {/* Tab-open warning banner */}
        <div className="flex items-center gap-[10px] bg-[#fffbeb] border border-[#fde68a] rounded-[12px] px-[14px] py-[10px]">
          <span className="text-[15px] flex-shrink-0">⚠️</span>
          <p className="text-[12px] font-semibold text-[#92400e] m-0 leading-snug">
            Keep this tab open — navigating away stops generation
          </p>
        </div>
      </div>
    )
  }

  // ── No topics: empty state ────────────────────────────────
  if (topics.length === 0) {
    // A post was already picked and is actively in-flight.
    // Guide the user back to /review rather than showing a misleading empty state.
    if (activePost && IN_FLIGHT_STATUSES.has(activePost.status)) {
      const isReady = activePost.status === 'awaiting_approval'
      return (
        <div>
          <TapTracker step={2} />
          <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">
            Tap 2 of 2 · {isReady ? 'almost done' : 'generating'}
          </p>
          <h1 className="text-[22px] font-extrabold text-text leading-[1.18] tracking-tight m-0 mb-1">
            {isReady ? 'Your post is ready' : 'Your post is being built…'}
          </h1>
          <p className="text-[13px] font-medium text-muted m-0 mb-5 leading-[1.5]">
            {isReady
              ? 'Review, approve or tweak before saving.'
              : 'Generation started — it\'ll be ready in about 20–40 seconds.'}
          </p>
          {activePost.topics?.title && (
            <div className="bg-white border border-border rounded-[14px] px-4 py-[12px] shadow-card-sm mb-5">
              <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted m-0 mb-[6px]">Topic</p>
              <p className="text-[14px] font-bold text-text m-0 leading-snug">{activePost.topics.title}</p>
            </div>
          )}
          <Link
            href="/review"
            className="block w-full text-center bg-gradient-to-br from-orange to-orange-600 text-white rounded-[14px] py-[16px] text-[15px] font-bold shadow-[0_8px_20px_rgba(245,134,69,.36)] hover:brightness-105 transition-all no-underline"
          >
            {isReady ? '→ Review & approve' : '→ Check generation progress'}
          </Link>
        </div>
      )
    }

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
          Topics are generated automatically at 09:00 IST. Use the button below if today's run didn't complete.
        </p>

        {error  && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}
        {notice && <p className="text-muted text-[0.88rem] mb-3">{notice}</p>}

        <div className="mb-4">
          <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-[8px]">Content format</p>
          <SegControl options={FORMAT_OPTIONS} value={selectedFormat} onChange={setSelectedFormat} />
        </div>

        <button
          onClick={generateNow}
          disabled={generating}
          className="w-full border-[1.5px] border-dashed border-border-strong bg-transparent rounded-[14px] px-4 py-[14px] text-[13px] font-semibold text-muted cursor-pointer flex items-center justify-center gap-2 transition-colors duration-150 hover:border-orange hover:text-orange-600 hover:bg-white disabled:opacity-50"
        >
          {generating ? (
            <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Generating…</>
          ) : (
            <>↻ Regenerate Topics</>
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
      <p className="text-[13px] font-medium text-muted m-0 mb-3 leading-[1.5]">
        Tap a topic to start building your post — takes about 30 seconds.
      </p>

      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-[8px]">Content format</p>
        <SegControl options={FORMAT_OPTIONS} value={selectedFormat} onChange={setSelectedFormat} />
      </div>

      {notice && <p className="text-[12.5px] font-medium text-muted m-0 mb-3">{notice}</p>}
      {error  && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}

      {topics.map((t) => {
        const isSelected = busy && pickedId === t.id
        const conf = topicConfidence(t)
        return (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            disabled={busy}
            className={[
              'w-full text-left bg-white rounded-[16px] p-4 mb-3 shadow-card-sm cursor-pointer transition-all duration-150 relative group border',
              isSelected
                ? 'border-orange shadow-card'
                : 'border-border hover:shadow-card hover:border-border-strong active:scale-[0.985]',
              busy && !isSelected ? 'opacity-60' : '',
            ].join(' ')}
          >
            {/* Slot number */}
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

            {/* Topic Confidence Section */}
            <div className="mt-[11px] pt-[11px] border-t border-dashed border-border">
              <div className="flex items-center justify-between mb-[5px]">
                <span className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted">AI Confidence</span>
                <div className="flex items-center gap-[7px]">
                  <span className="text-[11px] font-semibold text-muted">{conf.label}</span>
                  <ConfidenceDots level={conf.level} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] font-semibold text-muted m-0 leading-snug">{conf.reason}</p>
                {t.decision_trace && (
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTraceModal(t) }}
                    className="text-[11px] font-bold text-orange shrink-0 ml-3 no-underline hover:underline"
                  >
                    Why?
                  </a>
                )}
              </div>
            </div>

            {/* Tap indicator / selected state */}
            {isSelected ? (
              <div className="absolute right-[14px] bottom-[14px] flex items-center gap-[6px]">
                <span className="w-[14px] h-[14px] border-[2px] border-orange border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="text-[11px] font-bold text-orange">Building…</span>
              </div>
            ) : (
              <div className="absolute right-[14px] bottom-[14px] w-[28px] h-[28px] rounded-full bg-bg flex items-center justify-center text-text transition-colors duration-150 group-hover:bg-orange group-hover:text-white text-[13px]">
                →
              </div>
            )}
          </button>
        )
      })}

      {/* Regenerate button with consequence hint */}
      <div className="mt-[2px]">
        <button
          onClick={rejectAll}
          disabled={busy}
          className="w-full border-[1.5px] border-dashed border-border-strong bg-transparent rounded-[14px] px-4 py-[13px] text-[13px] font-semibold text-muted cursor-pointer flex items-center justify-center gap-2 transition-colors duration-150 hover:border-orange hover:text-orange-600 hover:bg-white disabled:opacity-50"
        >
          {regenerating ? (
            <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Regenerating…</>
          ) : (
            <>↻ Get 3 different topics</>
          )}
        </button>
        {!regenerating && (
          <p className="text-center text-[11px] text-muted mt-[6px] m-0">
            Replaces these 3 topics with a new set
          </p>
        )}
      </div>

      {traceModal && <TraceModal topic={traceModal} onClose={() => setTraceModal(null)} />}
    </div>
  )
}
