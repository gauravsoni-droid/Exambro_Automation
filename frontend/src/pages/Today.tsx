'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '../lib/api'
import type { Topic } from '../types'
import TapTracker from '../components/TapTracker'
import TopicPill from '../components/TopicPill'

export default function Today() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

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
    setNotice('')
    try {
      const result = await api.post<{ created?: number; skipped?: string }>('/topics/run-round')
      if (result.skipped) setNotice(`Skipped: ${result.skipped}`)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Topic generation failed')
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

  // ── Generating state (after picking a topic) ─────────────
  if (generating) {
    return (
      <div>
        <TapTracker step={1} />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-[54px] h-[54px] rounded-full border-4 border-border border-t-orange animate-spin mb-5" />
          <h3 className="text-[19px] font-extrabold text-text m-0 mb-[7px]">Generating new topics</h3>
          <p className="text-[13px] font-medium text-muted m-0 leading-[1.5] max-w-[240px]">
            Running news search and AI topic suggestions — up to a minute.
          </p>
          <div className="mt-5 flex flex-col gap-[9px] w-full max-w-[240px]">
            {["Scanning today's news", 'Picking from your pillars', 'Ranking by relevance'].map((s) => (
              <div key={s} className="flex items-center gap-[9px] text-[12.5px] font-semibold text-muted">
                <span className="w-[18px] h-[18px] rounded-full bg-good flex items-center justify-center text-white text-[11px] flex-shrink-0">✓</span>
                {s}
              </div>
            ))}
          </div>
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
          className="w-full border-[1.5px] border-dashed border-border-strong bg-transparent rounded-[14px] px-4 py-[13px] text-[13px] font-semibold text-muted cursor-pointer flex items-center justify-center gap-2 transition-colors duration-150 hover:border-orange hover:text-orange-600 hover:bg-white disabled:opacity-50"
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
        Tap 1 of 2 · about 30 seconds
      </p>
      <h1 className="text-[22px] font-extrabold text-text leading-[1.18] tracking-tight m-0 mb-1">
        Pick today's topic
      </h1>
      <p className="text-[13px] font-medium text-muted m-0 mb-4 leading-[1.5]">
        Three ready-to-go ideas, one from each theme. Tap the one you like.
      </p>

      {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}

      {topics.map((t) => (
        <button
          key={t.id}
          onClick={() => pick(t.id)}
          disabled={busy}
          className="w-full text-left bg-white border border-border rounded-xl p-4 mb-3 shadow-card-sm cursor-pointer transition-all duration-150 hover:shadow-card hover:border-border-strong active:scale-[0.985] disabled:opacity-60 relative group"
        >
          {/* Pills row */}
          <div className="flex flex-wrap gap-2 mb-[10px]">
            {t.pillar_name && <TopicPill name={t.pillar_name} />}
            {t.is_rotation_exception && (
              <span className="inline-flex items-center gap-[5px] text-[10.5px] font-bold text-[#c2415c] bg-[#fbe9ec] px-2 py-[5px] rounded-[7px]">
                🔥 Urgent news
              </span>
            )}
            {t.from_idea_id && (
              <span className="inline-flex items-center gap-[5px] text-[10.5px] font-bold text-good bg-good-bg px-2 py-[5px] rounded-[7px]">
                💡 Your idea
              </span>
            )}
          </div>

          {/* Title + description */}
          <h3 className="text-[16px] font-bold text-text leading-[1.3] m-0 mb-[5px] tracking-[-0.01em] pr-8">
            {t.title}
          </h3>
          <p className="text-[13px] font-medium text-muted m-0 leading-[1.45] pr-8">{t.description}</p>

          {/* Signal lines */}
          {(t.is_rotation_exception || t.from_idea_id || t.pillar_name) && (
            <div className="mt-[11px] pt-[11px] border-t border-dashed border-border flex flex-col gap-[6px]">
              {t.is_rotation_exception && (
                <p className="text-[11.5px] font-semibold text-muted m-0 flex items-center gap-[7px]">
                  <span className="text-[12px]">🔥</span> Trending topic — competitors may be posting this now
                </p>
              )}
              {t.from_idea_id && (
                <p className="text-[11.5px] font-semibold text-muted m-0 flex items-center gap-[7px]">
                  <span className="text-[12px]">📌</span> Based on an idea you submitted
                </p>
              )}
              {!t.is_rotation_exception && !t.from_idea_id && t.pillar_name && (
                <p className="text-[11.5px] font-semibold text-muted m-0 flex items-center gap-[7px]">
                  <span className="text-[12px]">📈</span> From your {t.pillar_name.toLowerCase()} pillar
                </p>
              )}
            </div>
          )}

          {/* Arrow → */}
          <div className="absolute right-[14px] bottom-[14px] w-[30px] h-[30px] rounded-full bg-bg flex items-center justify-center text-text transition-colors duration-150 group-hover:bg-orange group-hover:text-white text-[14px]">
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
        ↻ Show me three new ideas
      </button>
    </div>
  )
}
