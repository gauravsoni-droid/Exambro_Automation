'use client'

// Tests page — CD13 NOW phase.
// Generates 50 real writer→critic posts and displays them as a batch list.
// Owner judging and retune are deferred (CD13 LATER — owner not yet available).

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { CalibrationBatchStatus, CalibrationItem, CalibrationSummary } from '../types'

function elapsedLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export default function Calibration() {
  const [items, setItems]       = useState<CalibrationItem[]>([])
  const [summary, setSummary]   = useState<CalibrationSummary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedCount, setGeneratedCount] = useState(0)
  const [elapsed, setElapsed]   = useState(0)
  const [genError, setGenError] = useState('')
  const [startError, setStartError] = useState('')
  const genStartRef = useRef<number | null>(null)

  const fetchItems = useCallback(async () => {
    const [newItems, newSum] = await Promise.all([
      api.get<CalibrationItem[]>('/calibration/items'),
      api.get<CalibrationSummary>('/calibration/summary'),
    ])
    setItems(newItems)
    setSummary(newSum)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsData, sumData, statusData] = await Promise.all([
        api.get<CalibrationItem[]>('/calibration/items'),
        api.get<CalibrationSummary>('/calibration/summary'),
        api.get<CalibrationBatchStatus>('/calibration/batch-status'),
      ])
      setItems(itemsData)
      setSummary(sumData)
      if (statusData.generating) {
        setGenerating(true)
        setGeneratedCount(statusData.generated)
      } else if (statusData.error) {
        setGenError(statusData.error)
      }
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Poll batch-status every 2s while generating
  useEffect(() => {
    if (!generating) return
    const iv = setInterval(async () => {
      try {
        const status = await api.get<CalibrationBatchStatus>('/calibration/batch-status')
        setGeneratedCount(status.generated)
        if (!status.generating) {
          setGenerating(false)
          genStartRef.current = null
          if (status.error) {
            setGenError(status.error)
          } else {
            try {
              await fetchItems()
            } catch {
              setGenError('Generation finished but results failed to load. Please refresh.')
            }
          }
        }
      } catch { /* silent — next tick will retry */ }
    }, 2000)
    return () => clearInterval(iv)
  }, [generating, fetchItems])

  // Elapsed counter
  useEffect(() => {
    if (!generating) { setElapsed(0); return }
    if (!genStartRef.current) genStartRef.current = Date.now()
    const iv = setInterval(() => {
      if (genStartRef.current)
        setElapsed(Math.floor((Date.now() - genStartRef.current) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [generating])

  async function startGeneration() {
    setStartError('')
    setGenError('')
    try {
      await api.post('/calibration/generate-batch', {})
      setGenerating(true)
      setGeneratedCount(0)
      genStartRef.current = Date.now()
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : 'Failed to start generation')
    }
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-[54px] h-[54px] rounded-full border-4 border-border border-t-orange animate-spin mb-5" />
        <p className="text-[13px] font-medium text-muted">Loading Tests…</p>
      </div>
    )
  }

  // ── Generating ───────────────────────────────────────────
  if (generating) {
    const pct = Math.round((generatedCount / 50) * 100)
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">
            Tests
          </h1>
          <p className="text-[12.5px] font-medium text-muted m-0 leading-snug">
            Running writer → critic for 50 test posts. This takes 3–5 minutes.
          </p>
        </div>

        {/* Progress card */}
        <div className="bg-white border border-border rounded-[18px] p-5 shadow-card-sm mb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-text m-0">Generating test posts…</p>
            <p className="text-[13px] font-bold text-orange m-0 tabular-nums">{generatedCount} / 50</p>
          </div>

          {/* Progress bar */}
          <div className="h-[6px] bg-bg rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-orange rounded-full transition-all duration-500"
              style={{ width: generatedCount > 0 ? `${pct}%` : '2%' }}
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-muted m-0">
              Writer → Critic running for each post
            </p>
            <p className="text-[12px] font-semibold text-muted m-0 tabular-nums">
              ⏱ {elapsedLabel(elapsed)}
            </p>
          </div>
        </div>

        {/* Amber tab-open banner */}
        <div className="flex items-center gap-[10px] bg-[#fffbeb] border border-[#fde68a] rounded-[12px] px-[14px] py-[10px]">
          <span className="text-[15px] flex-shrink-0">⚠️</span>
          <p className="text-[12px] font-semibold text-[#92400e] m-0 leading-snug">
            Keep this tab open — navigating away stops generation
          </p>
        </div>
      </div>
    )
  }

  // ── Generation error ─────────────────────────────────────
  if (genError) {
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">Tests</h1>
        </div>
        <div className="bg-white border border-[#f3d4da] rounded-[18px] p-5 shadow-card-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-[#fbe9ec] flex items-center justify-center flex-shrink-0 text-[18px]">⚠️</div>
            <div>
              <p className="text-[14px] font-bold text-text m-0 leading-snug">Generation failed</p>
              <p className="text-[12px] font-medium text-muted m-0 mt-[2px]">Something went wrong. You can retry below.</p>
            </div>
          </div>
          <p className="text-[11.5px] font-mono text-bad bg-[#fbe9ec] rounded-[9px] px-3 py-2 m-0 break-all mb-3">
            {genError}
          </p>
          <button
            onClick={() => { setGenError(''); startGeneration() }}
            className="w-full bg-orange text-white rounded-[12px] py-[12px] text-[13px] font-bold border-0 cursor-pointer hover:brightness-105 transition-all"
          >
            ↻ Retry generation
          </button>
        </div>
      </div>
    )
  }

  // ── Empty — no posts generated yet ───────────────────────
  if (items.length === 0) {
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">
            Tests
          </h1>
          <p className="text-[12.5px] font-medium text-muted m-0 leading-snug">
            Generate 50 real posts and check how well the AI critic judges them before going live.
          </p>
        </div>

        {startError && <p className="text-bad text-[0.88rem] mb-3">{startError}</p>}

        {/* Empty state card */}
        <div className="bg-white border border-border rounded-[18px] p-6 shadow-card-sm text-center mb-4">
          <p className="text-[34px] mb-2">🧪</p>
          <p className="text-[15px] font-bold text-text m-0 mb-[6px]">No test posts yet</p>
          <p className="text-[12.5px] font-medium text-muted m-0 leading-[1.5]">
            Generate 50 posts across your content pillars. The AI writer and critic both run on
            each one — takes 3–5 minutes.
          </p>
        </div>

        <button
          onClick={startGeneration}
          className="w-full bg-orange text-white rounded-[14px] py-[15px] text-[14px] font-bold border-0 cursor-pointer hover:brightness-105 transition-all shadow-card-sm"
        >
          ✦ Generate 50 Test Posts
        </button>

        <p className="text-center text-[11px] text-muted mt-[8px] m-0">
          Writer → Critic runs for each post · caption + hashtags only · takes 3–5 min
        </p>
      </div>
    )
  }

  // ── Partial batch — recovery ─────────────────────────────
  if (items.length < 50) {
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">
            Tests
          </h1>
        </div>

        <div className="bg-white border border-[#f1d6ab] rounded-[18px] p-5 shadow-card-sm mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-[#fff3cd] flex items-center justify-center flex-shrink-0 text-[18px]">⚠️</div>
            <div>
              <p className="text-[14px] font-bold text-text m-0 leading-snug">Incomplete calibration batch detected</p>
              <p className="text-[12px] font-medium text-muted m-0 mt-[2px]">
                {items.length} of 50 posts were saved — the previous run did not finish.
              </p>
            </div>
          </div>
          <p className="text-[12px] font-medium text-muted m-0 leading-[1.5]">
            Regenerating will delete the {items.length} existing post{items.length === 1 ? '' : 's'} and start a fresh batch of 50.
          </p>
        </div>

        {startError && <p className="text-bad text-[0.88rem] mb-3">{startError}</p>}

        <button
          onClick={startGeneration}
          className="w-full bg-orange text-white rounded-[14px] py-[15px] text-[14px] font-bold border-0 cursor-pointer hover:brightness-105 transition-all shadow-card-sm"
        >
          ↻ Regenerate Batch
        </button>

        <p className="text-center text-[11px] text-muted mt-[8px] m-0">
          Deletes incomplete batch · runs writer → critic for all 50 · takes 3–5 min
        </p>
      </div>
    )
  }

  // ── Batch list ────────────────────────────────────────────
  const labeled  = summary?.labeled ?? 0
  const total    = summary?.total   ?? 0
  const agreed   = summary?.agreed  ?? 0
  const pct      = labeled > 0 ? Math.round((agreed / labeled) * 100) : 0
  const passed   = summary?.pass_gate ?? false
  const remaining = Math.max(0, 40 - agreed)

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">
          Tests
        </h1>
        <p className="text-[12.5px] font-medium text-muted m-0 leading-snug">
          {items.length} posts generated · critic scores hidden until judging phase
        </p>
      </div>

      {/* Summary stats */}
      {summary && labeled > 0 && (
        <div className="grid grid-cols-3 gap-[9px] mb-4">
          <div className="bg-white border border-border rounded-[16px] px-3 py-[14px] shadow-card-sm text-center">
            <p className="text-[1.8rem] font-extrabold text-accent-700 m-0 leading-none mb-1">{labeled}/{total}</p>
            <p className="text-[11px] font-medium text-muted m-0 leading-snug">judged</p>
          </div>
          <div className="bg-white border border-border rounded-[16px] px-3 py-[14px] shadow-card-sm text-center">
            <p className="text-[1.8rem] font-extrabold text-text m-0 leading-none mb-1">{pct}%</p>
            <p className="text-[11px] font-medium text-muted m-0 leading-snug">agreement</p>
          </div>
          <div className={`border rounded-[16px] px-3 py-[14px] shadow-card-sm text-center ${passed ? 'bg-good-bg border-good/30' : 'bg-white border-border'}`}>
            <p className={`text-[1.8rem] font-extrabold m-0 leading-none mb-1 ${passed ? 'text-good' : 'text-text'}`}>
              {passed ? '✓' : remaining}
            </p>
            <p className={`text-[11px] font-medium m-0 leading-snug ${passed ? 'text-good' : 'text-muted'}`}>
              {passed ? 'gate passed' : 'to go'}
            </p>
          </div>
        </div>
      )}

      {/* Gate passed banner */}
      {passed && (
        <div className="bg-good-bg border border-good/30 rounded-[16px] px-4 py-[14px] mb-4">
          <p className="text-[13px] font-bold text-good m-0 mb-[6px]">Gate passed — critic is calibrated</p>
          <p className="text-[12px] font-medium text-[#1f6b49] m-0 leading-[1.5]">
            Your critic agrees with you ≥ 80% of the time. Go to Settings → Promote to move
            agreed samples into golden examples for the writer.
          </p>
        </div>
      )}

      {/* Progress nudge */}
      {!passed && labeled >= 10 && (
        <div className="bg-[#fff8e6] border border-[#f1d6ab] rounded-[16px] px-4 py-[14px] mb-4">
          <p className="text-[12px] font-medium text-[#8a5e0a] m-0 leading-[1.5]">
            {pct >= 80
              ? `${pct}% agreement — on track. Judge ${Math.max(0, 50 - labeled)} more posts to reach the gate.`
              : `${pct}% agreement — below the 80% target. Consider adjusting the Rules in Settings and re-running.`}
          </p>
        </div>
      )}

      {/* Batch list */}
      <div className="flex flex-col gap-[8px]">
        {items.map((item, idx) => {
          const isReviewed = item.owner_verdict !== null
          const visibleTags = item.hashtags.slice(0, 3)
          const extraTags   = item.hashtags.length - visibleTags.length

          return (
            <div
              key={item.id}
              className="bg-white border border-border rounded-[14px] p-4 shadow-card-sm"
            >
              <div className="flex items-start gap-3">
                {/* Number badge */}
                <span className="w-[28px] h-[28px] rounded-full bg-bg flex items-center justify-center text-[11px] font-bold text-muted flex-shrink-0 mt-[1px]">
                  {idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  {/* Caption preview */}
                  <p className="text-[13px] font-medium text-text m-0 mb-[8px] leading-[1.45] line-clamp-2 break-words">
                    {item.content}
                  </p>

                  {/* Hashtag chips */}
                  {visibleTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-[5px] mb-[9px]">
                      {visibleTags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-semibold text-accent-700 bg-[#eaf1fa] px-[7px] py-[3px] rounded-full"
                        >
                          #{tag.replace(/^#/, '')}
                        </span>
                      ))}
                      {extraTags > 0 && (
                        <span className="text-[10px] font-medium text-muted">+{extraTags}</span>
                      )}
                    </div>
                  )}

                  {/* Status badges */}
                  <div className="flex items-center gap-[6px] flex-wrap">
                    <span
                      className={`text-[10.5px] font-bold px-[8px] py-[4px] rounded-[6px] ${
                        isReviewed ? 'bg-good-bg text-good' : 'bg-bg text-muted'
                      }`}
                    >
                      {isReviewed ? '✓ Reviewed' : 'Pending'}
                    </span>
                    <span className="text-[10.5px] font-bold px-[8px] py-[4px] rounded-[6px] bg-bg text-muted">
                      🔒 Critic Review Hidden
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="pb-8" />
    </div>
  )
}
