'use client'

// Tests (Calibration) page — Phase-0 critic accuracy workflow.
// 50 real writer→critic posts; filters, search, progress, keyboard shortcuts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { CalibrationBatchStatus, CalibrationItem, CalibrationSummary } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedbackOption = 'approve' | 'needs_changes' | 'reject'
type FilterKey      = 'all' | 'pending' | 'approve' | 'needs_changes' | 'reject'

interface IndexedItem {
  item: CalibrationItem
  originalIndex: number
}

// ── Static config ─────────────────────────────────────────────────────────────

const FEEDBACK: Record<
  FeedbackOption,
  { icon: string; label: string; selectedCls: string; hoverCls: string; badgeCls: string; borderCls: string }
> = {
  approve: {
    icon: '✅', label: 'Approve',
    selectedCls: 'border-good bg-good-bg text-good',
    hoverCls:    'hover:border-good/50 hover:bg-good-bg/60 hover:text-good',
    badgeCls:    'bg-good-bg text-good border border-good/20',
    borderCls:   'border-l-good',
  },
  needs_changes: {
    icon: '✏️', label: 'Needs Changes',
    selectedCls: 'border-orange bg-[#fff3e6] text-orange',
    hoverCls:    'hover:border-orange/50 hover:bg-[#fff3e6]/60 hover:text-orange',
    badgeCls:    'bg-[#fff3e6] text-orange border border-orange/20',
    borderCls:   'border-l-orange',
  },
  reject: {
    icon: '❌', label: 'Reject',
    selectedCls: 'border-bad bg-[#fbe9ec] text-bad',
    hoverCls:    'hover:border-bad/50 hover:bg-[#fbe9ec]/60 hover:text-bad',
    badgeCls:    'bg-[#fbe9ec] text-bad border border-bad/20',
    borderCls:   'border-l-bad',
  },
}

const FILTERS: { key: FilterKey; label: string; icon?: string }[] = [
  { key: 'all',           label: 'All' },
  { key: 'pending',       label: 'Waiting for Review' },
  { key: 'approve',       label: 'Approved',       icon: '✅' },
  { key: 'needs_changes', label: 'Needs Changes',  icon: '✏️' },
  { key: 'reject',        label: 'Rejected',        icon: '❌' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedLabel(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function formatReviewTime(d: Date) {
  const date = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} · ${time}`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-muted uppercase tracking-widest m-0 mb-[8px]">
      {children}
    </p>
  )
}

function ScoreBar({ score }: { score: number }) {
  const pct      = Math.min(100, score * 10)
  const colorCls = score >= 8 ? 'bg-good' : score >= 6 ? 'bg-orange' : 'bg-bad'
  return (
    <div className="h-[6px] bg-bg rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${colorCls}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function KbdKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-[5px] bg-bg border border-border rounded-[4px] text-[9px] font-bold font-mono text-muted">
      {children}
    </kbd>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-border rounded-[14px] p-4 shadow-card-sm animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-[30px] h-[30px] rounded-full bg-bg flex-shrink-0" />
        <div className="flex-1">
          <div className="h-[13px] bg-bg rounded-full mb-2 w-full" />
          <div className="h-[13px] bg-bg rounded-full mb-4 w-4/5" />
          <div className="flex gap-[6px] mb-3">
            <div className="h-[18px] bg-bg rounded-full w-14" />
            <div className="h-[18px] bg-bg rounded-full w-16" />
            <div className="h-[18px] bg-bg rounded-full w-10" />
          </div>
          <div className="h-[24px] bg-bg rounded-[6px] w-36" />
        </div>
        <div className="w-3 h-5 bg-bg rounded flex-shrink-0 mt-1" />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Calibration() {
  // ── Core data state
  const [items, setItems]                   = useState<CalibrationItem[]>([])
  const [summary, setSummary]               = useState<CalibrationSummary | null>(null)
  const [loading, setLoading]               = useState(true)
  const [generating, setGenerating]         = useState(false)
  const [generatedCount, setGeneratedCount] = useState(0)
  const [elapsed, setElapsed]               = useState(0)
  const [genError, setGenError]             = useState('')
  const [startError, setStartError]         = useState('')
  const genStartRef                         = useRef<number | null>(null)

  // ── Filter / search
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [searchQuery, setSearchQuery]   = useState('')

  // ── Review timestamps (tracked locally; API doesn't expose owner_labeled_at)
  const [reviewTimes, setReviewTimes] = useState<Record<string, Date>>({})

  // ── Toast
  const [toast, setToast]    = useState<{ msg: string; ok: boolean } | null>(null)
  const toastTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Modal state
  const [selectedItem, setSelectedItem]   = useState<CalibrationItem | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [feedback, setFeedback]           = useState<FeedbackOption | ''>('')
  const [comments, setComments]           = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [modalError, setModalError]       = useState('')
  const [copied, setCopied]               = useState(false)

  // ── Scroll position memory
  const scrollPosRef = useRef(0)

  // ── Ref mirror for keyboard handler (avoids stale closures without extra deps)
  const kbRef = useRef({ selectedItem, displayItems: [] as IndexedItem[], submitting })

  // ── Derived: filtered + sorted list ─────────────────────────────────────────

  const displayItems = useMemo<IndexedItem[]>(() => {
    const indexed = items.map((item, originalIndex) => ({ item, originalIndex }))

    let result = indexed
    if (activeFilter === 'pending') {
      result = indexed.filter(({ item }) => item.owner_verdict === null)
    } else if (activeFilter !== 'all') {
      result = indexed.filter(({ item }) => item.owner_feedback === activeFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(({ item }) =>
        item.content.toLowerCase().includes(q) ||
        item.hashtags.some(h => h.toLowerCase().includes(q)),
      )
    }

    // Sort: pending first → preserve original order; reviewed → reverse (newest-first)
    return result.sort((a, b) => {
      const ap = a.item.owner_verdict === null ? 0 : 1
      const bp = b.item.owner_verdict === null ? 0 : 1
      if (ap !== bp) return ap - bp
      return ap === 1
        ? b.originalIndex - a.originalIndex   // reviewed: newest first
        : a.originalIndex - b.originalIndex   // pending: oldest first
    })
  }, [items, activeFilter, searchQuery])

  // ── Filter counts for badges ─────────────────────────────────────────────────

  const filterCounts = useMemo(() => ({
    all:           items.length,
    pending:       items.filter(i => i.owner_verdict === null).length,
    approve:       items.filter(i => i.owner_feedback === 'approve').length,
    needs_changes: items.filter(i => i.owner_feedback === 'needs_changes').length,
    reject:        items.filter(i => i.owner_feedback === 'reject').length,
  }), [items])

  // Keep kb ref current every render
  kbRef.current = { selectedItem, displayItems, submitting }

  // ── Data fetching ─────────────────────────────────────────────────────────────

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

  // Batch-status poll
  useEffect(() => {
    if (!generating) return
    const iv = setInterval(async () => {
      try {
        const status = await api.get<CalibrationBatchStatus>('/calibration/batch-status')
        setGeneratedCount(status.generated)
        if (!status.generating) {
          setGenerating(false)
          genStartRef.current = null
          if (status.error) setGenError(status.error)
          else {
            try { await fetchItems() }
            catch { setGenError('Generation finished but results failed to load. Please refresh.') }
          }
        }
      } catch { /* silent */ }
    }, 2000)
    return () => clearInterval(iv)
  }, [generating, fetchItems])

  // Elapsed timer
  useEffect(() => {
    if (!generating) { setElapsed(0); return }
    if (!genStartRef.current) genStartRef.current = Date.now()
    const iv = setInterval(() => {
      if (genStartRef.current) setElapsed(Math.floor((Date.now() - genStartRef.current) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [generating])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  const isModalOpen = !!selectedItem

  useEffect(() => {
    if (!isModalOpen) return

    function onKey(e: KeyboardEvent) {
      const { selectedItem: cur, displayItems: dis, submitting: sub } = kbRef.current
      if (!cur || sub) return
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const isReviewed = cur.owner_verdict !== null
      const idx        = dis.findIndex(({ item }) => item.id === cur.id)

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          setSelectedItem(null)
          requestAnimationFrame(() => window.scrollTo({ top: scrollPosRef.current, behavior: 'instant' as ScrollBehavior }))
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (idx > 0) {
            const { item, originalIndex } = dis[idx - 1]
            setSelectedItem(item); setSelectedIndex(originalIndex)
            setFeedback(''); setComments(''); setModalError(''); setCopied(false)
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (idx < dis.length - 1) {
            const { item, originalIndex } = dis[idx + 1]
            setSelectedItem(item); setSelectedIndex(originalIndex)
            setFeedback(''); setComments(''); setModalError(''); setCopied(false)
          }
          break
        default:
          if (isReviewed) break
          if (e.key === 'a' || e.key === 'A') setFeedback('approve')
          if (e.key === 'n' || e.key === 'N') setFeedback('needs_changes')
          if (e.key === 'r' || e.key === 'R') setFeedback('reject')
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isModalOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────────

  function showToast(msg: string, ok = true) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ msg, ok })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  async function startGeneration() {
    setStartError(''); setGenError('')
    try {
      await api.post('/calibration/generate-batch', {})
      setGenerating(true); setGeneratedCount(0)
      genStartRef.current = Date.now()
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : 'Failed to start generation')
    }
  }

  function openModal(item: CalibrationItem, origIdx: number) {
    scrollPosRef.current = window.scrollY
    setSelectedItem(item); setSelectedIndex(origIdx)
    setFeedback(''); setComments(''); setModalError(''); setCopied(false)
  }

  function closeModal() {
    if (submitting) return
    setSelectedItem(null)
    requestAnimationFrame(() => window.scrollTo({ top: scrollPosRef.current, behavior: 'instant' as ScrollBehavior }))
  }

  function navigateTo({ item, originalIndex }: IndexedItem) {
    setSelectedItem(item); setSelectedIndex(originalIndex)
    setFeedback(''); setComments(''); setModalError(''); setCopied(false)
    // Don't update scrollPosRef — preserve for when modal closes
  }

  async function copyCaption() {
    if (!selectedItem) return
    try {
      await navigator.clipboard.writeText(selectedItem.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  async function submitFeedback() {
    if (!selectedItem || !feedback || submitting) return
    setSubmitting(true); setModalError('')
    try {
      const updated = await api.post<CalibrationItem>(
        `/calibration/${selectedItem.id}/label`,
        { feedback, comments: comments.trim() || null },
      )
      const now = new Date()
      setReviewTimes(prev => ({ ...prev, [updated.id]: now }))
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
      setSelectedItem(updated)
      const newSum = await api.get<CalibrationSummary>('/calibration/summary')
      setSummary(newSum)
      setFeedback(''); setComments('')
      showToast('Feedback saved!')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to save feedback'
      setModalError(msg)
      showToast(msg, false)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <div className="mb-4">
          <div className="h-[28px] w-20 bg-bg rounded-full animate-pulse mb-2" />
          <div className="h-[15px] w-56 bg-bg rounded-full animate-pulse" />
        </div>
        <div className="h-[40px] bg-bg rounded-[12px] animate-pulse mb-3" />
        <div className="flex gap-2 mb-4 overflow-hidden">
          {[72, 140, 90, 120, 84].map((w, i) => (
            <div key={i} className="h-[32px] bg-bg rounded-full animate-pulse flex-shrink-0" style={{ width: w }} />
          ))}
        </div>
        <div className="flex flex-col gap-[7px]">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  // ── Generating ────────────────────────────────────────────────────────────────

  if (generating) {
    const pct = Math.round((generatedCount / 50) * 100)
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">Tests</h1>
          <p className="text-[12.5px] font-medium text-muted m-0">Running writer → critic for 50 test posts. Takes 3–5 minutes.</p>
        </div>
        <div className="bg-white border border-border rounded-[18px] p-5 shadow-card-sm mb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-text m-0">Generating test posts…</p>
            <p className="text-[13px] font-bold text-orange m-0 tabular-nums">{generatedCount} / 50</p>
          </div>
          <div className="h-[6px] bg-bg rounded-full overflow-hidden mb-3">
            <div className="h-full bg-orange rounded-full transition-all duration-500" style={{ width: generatedCount > 0 ? `${pct}%` : '2%' }} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-muted m-0">Writer → Critic for each post</p>
            <p className="text-[12px] font-semibold text-muted m-0 tabular-nums">⏱ {elapsedLabel(elapsed)}</p>
          </div>
        </div>
        <div className="flex items-center gap-[10px] bg-[#fffbeb] border border-[#fde68a] rounded-[12px] px-[14px] py-[10px]">
          <span className="text-[15px] flex-shrink-0">⚠️</span>
          <p className="text-[12px] font-semibold text-[#92400e] m-0">Keep this tab open — navigating away stops generation</p>
        </div>
      </div>
    )
  }

  // ── Generation error ──────────────────────────────────────────────────────────

  if (genError) {
    return (
      <div>
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-5">Tests</h1>
        <div className="bg-white border border-[#f3d4da] rounded-[18px] p-5 shadow-card-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-[#fbe9ec] flex items-center justify-center flex-shrink-0 text-[18px]">⚠️</div>
            <div>
              <p className="text-[14px] font-bold text-text m-0">Generation failed</p>
              <p className="text-[12px] font-medium text-muted m-0 mt-[2px]">Something went wrong. You can retry below.</p>
            </div>
          </div>
          <p className="text-[11.5px] font-mono text-bad bg-[#fbe9ec] rounded-[9px] px-3 py-2 m-0 break-all mb-3">{genError}</p>
          <button onClick={() => { setGenError(''); startGeneration() }}
            className="w-full bg-orange text-white rounded-[12px] py-[12px] text-[13px] font-bold border-0 cursor-pointer hover:brightness-105 transition-all">
            ↻ Retry generation
          </button>
        </div>
      </div>
    )
  }

  // ── Empty — no posts yet ──────────────────────────────────────────────────────

  if (items.length === 0) {
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">Tests</h1>
          <p className="text-[12.5px] font-medium text-muted m-0">Generate 50 real posts and check how well the AI critic judges them.</p>
        </div>
        {startError && <p className="text-bad text-[12.5px] mb-3">{startError}</p>}
        <div className="bg-white border border-border rounded-[18px] p-8 shadow-card-sm text-center mb-4">
          <p className="text-[40px] m-0 mb-3">🧪</p>
          <p className="text-[15px] font-bold text-text m-0 mb-2">No test posts yet</p>
          <p className="text-[12.5px] font-medium text-muted m-0 leading-[1.6] max-w-[280px] mx-auto">
            Generate 50 posts across your content pillars. Writer and critic both run on each one.
          </p>
        </div>
        <button onClick={startGeneration}
          className="w-full bg-orange text-white rounded-[14px] py-[15px] text-[14px] font-bold border-0 cursor-pointer hover:brightness-105 transition-all shadow-card-sm">
          ✦ Generate 50 Test Posts
        </button>
        <p className="text-center text-[11px] text-muted mt-[8px] m-0">Writer → Critic · caption + hashtags · 3–5 min</p>
      </div>
    )
  }

  // ── Partial batch ─────────────────────────────────────────────────────────────

  if (items.length < 50) {
    return (
      <div>
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-5">Tests</h1>
        <div className="bg-white border border-[#f1d6ab] rounded-[18px] p-5 shadow-card-sm mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-[#fff3cd] flex items-center justify-center flex-shrink-0 text-[18px]">⚠️</div>
            <div>
              <p className="text-[14px] font-bold text-text m-0">Incomplete batch</p>
              <p className="text-[12px] font-medium text-muted m-0 mt-[2px]">{items.length} of 50 posts saved — previous run didn't finish.</p>
            </div>
          </div>
        </div>
        {startError && <p className="text-bad text-[12.5px] mb-3">{startError}</p>}
        <button onClick={startGeneration}
          className="w-full bg-orange text-white rounded-[14px] py-[15px] text-[14px] font-bold border-0 cursor-pointer hover:brightness-105 transition-all shadow-card-sm">
          ↻ Regenerate Batch
        </button>
        <p className="text-center text-[11px] text-muted mt-[8px] m-0">Deletes incomplete batch · runs writer → critic for all 50 · 3–5 min</p>
      </div>
    )
  }

  // ── Full batch list ───────────────────────────────────────────────────────────

  const reviewedCount = items.filter(i => i.owner_verdict !== null).length
  const reviewPct     = Math.round((reviewedCount / items.length) * 100)
  const labeled       = summary?.labeled  ?? 0
  const agreed        = summary?.agreed   ?? 0
  const agreeePct     = labeled > 0 ? Math.round((agreed / labeled) * 100) : 0
  const passed        = summary?.pass_gate ?? false
  const remaining     = Math.max(0, 40 - agreed)

  // Modal-specific derived values (computed unconditionally for hooks consistency)
  const currentDisplayIdx = displayItems.findIndex(({ item }) => item.id === selectedItem?.id)
  const hasPrev           = currentDisplayIdx > 0
  const hasNext           = currentDisplayIdx < displayItems.length - 1

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">Tests</h1>
        <p className="text-[12.5px] font-medium text-muted m-0">
          {reviewedCount}/{items.length} reviewed · tap any card to give feedback
        </p>
      </div>

      {/* ── Review progress bar ─────────────────────────────────────────────── */}
      <div className="bg-white border border-border rounded-[14px] px-4 py-3 shadow-card-sm mb-4">
        <div className="flex items-center justify-between mb-[6px]">
          <p className="text-[12.5px] font-bold text-text m-0">Review Progress</p>
          <p className="text-[12.5px] font-bold tabular-nums m-0" style={{ color: reviewPct === 100 ? '#058e6e' : '#f58645' }}>
            {reviewedCount}/{items.length}
          </p>
        </div>
        <div className="h-[6px] bg-bg rounded-full overflow-hidden mb-[5px]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${reviewPct === 100 ? 'bg-good' : 'bg-orange'}`}
            style={{ width: `${Math.max(2, reviewPct)}%` }}
          />
        </div>
        <p className="text-[10.5px] font-medium text-muted m-0">
          {reviewPct === 100 ? 'All posts reviewed ✓' : `${items.length - reviewedCount} remaining`}
        </p>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[14px] pointer-events-none">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search captions or hashtags…"
          className="w-full border border-border rounded-[12px] pl-9 pr-9 py-[10px] text-[13px] font-medium text-text placeholder:text-muted focus:outline-none focus:border-orange/50 transition-colors bg-white"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[14px] border-0 bg-transparent cursor-pointer hover:text-text transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Filter chips ────────────────────────────────────────────────────── */}
      <div className="flex gap-[6px] overflow-x-auto pb-[2px] mb-4" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map(f => {
          const count    = filterCounts[f.key]
          const isActive = activeFilter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={[
                'flex-shrink-0 flex items-center gap-[5px] px-3 py-[7px] rounded-full',
                'text-[12px] font-semibold transition-all border cursor-pointer whitespace-nowrap',
                isActive
                  ? 'bg-orange text-white border-orange'
                  : 'bg-white text-muted border-border hover:border-orange/40 hover:text-text',
              ].join(' ')}
            >
              {f.icon && <span className="text-[11px]">{f.icon}</span>}
              {f.label}
              {count > 0 && (
                <span className={`text-[10px] font-bold min-w-[16px] h-[16px] px-[4px] rounded-full flex items-center justify-center ${
                  isActive ? 'bg-white/25 text-white' : 'bg-bg text-muted'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Stats (when some reviewed) ──────────────────────────────────────── */}
      {labeled > 0 && (
        <div className="grid grid-cols-3 gap-[9px] mb-4">
          <div className="bg-white border border-border rounded-[16px] px-3 py-[12px] shadow-card-sm text-center">
            <p className="text-[1.7rem] font-extrabold text-accent-700 m-0 leading-none mb-[3px] tabular-nums">{labeled}/{items.length}</p>
            <p className="text-[10.5px] font-semibold text-muted m-0">Reviewed</p>
          </div>
          <div className="bg-white border border-border rounded-[16px] px-3 py-[12px] shadow-card-sm text-center">
            <p className="text-[1.7rem] font-extrabold text-text m-0 leading-none mb-[3px] tabular-nums">{agreeePct}%</p>
            <p className="text-[10.5px] font-semibold text-muted m-0">Agreement</p>
          </div>
          <div className={`border rounded-[16px] px-3 py-[12px] shadow-card-sm text-center ${passed ? 'bg-good-bg border-good/30' : 'bg-white border-border'}`}>
            <p className={`text-[1.7rem] font-extrabold m-0 leading-none mb-[3px] ${passed ? 'text-good' : 'text-text'}`}>
              {passed ? '✓' : remaining}
            </p>
            <p className={`text-[10.5px] font-semibold m-0 ${passed ? 'text-good' : 'text-muted'}`}>
              {passed ? 'Passed' : 'To go'}
            </p>
          </div>
        </div>
      )}

      {/* Gate passed banner */}
      {passed && (
        <div className="bg-good-bg border border-good/30 rounded-[16px] px-4 py-[14px] mb-4">
          <p className="text-[13px] font-bold text-good m-0 mb-[4px]">Critic is calibrated ✓</p>
          <p className="text-[12px] font-medium text-[#1f6b49] m-0 leading-[1.5]">
            Your critic agrees ≥ 80% of the time. Go to Settings → Promote to move agreed samples into golden examples.
          </p>
        </div>
      )}

      {/* Progress nudge */}
      {!passed && labeled >= 10 && (
        <div className="bg-[#fff8e6] border border-[#f1d6ab] rounded-[16px] px-4 py-[12px] mb-4">
          <p className="text-[12px] font-medium text-[#8a5e0a] m-0 leading-[1.5]">
            {agreeePct >= 80
              ? `${agreeePct}% agreement — on track. Judge ${Math.max(0, 50 - labeled)} more to reach the gate.`
              : `${agreeePct}% agreement — below 80% target. Adjust Rules in Settings then re-run.`}
          </p>
        </div>
      )}

      {/* ── Card list ─────────────────────────────────────────────────────── */}
      {displayItems.length === 0 ? (
        /* ── Empty state for filters/search ── */
        <div className="bg-white border border-border rounded-[18px] p-8 shadow-card-sm text-center">
          <p className="text-[36px] m-0 mb-3">{searchQuery ? '🔍' : activeFilter === 'pending' ? '🎉' : '📋'}</p>
          <p className="text-[14px] font-bold text-text m-0 mb-2">
            {searchQuery
              ? 'No results found'
              : activeFilter === 'pending'
                ? 'All posts reviewed!'
                : 'No posts in this category'}
          </p>
          <p className="text-[12.5px] font-medium text-muted m-0 leading-[1.6] mb-4">
            {searchQuery
              ? `No posts match "${searchQuery}".`
              : activeFilter === 'pending'
                ? 'Great work — every post has been reviewed.'
                : `No ${activeFilter === 'approve' ? 'approved' : activeFilter === 'needs_changes' ? '"Needs Changes"' : 'rejected'} posts yet.`}
          </p>
          <button
            onClick={() => { setSearchQuery(''); setActiveFilter('all') }}
            className="text-[12.5px] font-bold text-accent-700 bg-accent-50 px-4 py-[8px] rounded-[8px] border-0 cursor-pointer hover:bg-accent/10 transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {displayItems.map(({ item, originalIndex }) => {
            const fb         = item.owner_feedback as FeedbackOption | null
            const fbCfg      = fb ? FEEDBACK[fb] : null
            const isReviewed = item.owner_verdict !== null
            const visible    = item.hashtags.slice(0, 3)
            const extra      = item.hashtags.length - visible.length

            return (
              <button
                key={item.id}
                onClick={() => openModal(item, originalIndex)}
                className={[
                  'w-full text-left bg-white border rounded-[14px] p-4 shadow-card-sm',
                  'cursor-pointer transition-all duration-150',
                  'hover:shadow-md hover:-translate-y-[1px] active:scale-[0.99]',
                  isReviewed && fbCfg
                    ? `border-l-[3px] ${fbCfg.borderCls} border-t-border border-r-border border-b-border`
                    : 'border-border hover:border-orange/30',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <span className="w-[30px] h-[30px] rounded-full bg-bg flex items-center justify-center text-[11px] font-bold text-muted flex-shrink-0 mt-[1px] tabular-nums">
                    {String(originalIndex + 1).padStart(2, '0')}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-text m-0 mb-[7px] leading-[1.45] line-clamp-2 break-words">
                      {item.content}
                    </p>

                    {visible.length > 0 && (
                      <div className="flex flex-wrap items-center gap-[4px] mb-[9px]">
                        {visible.map(tag => (
                          <span key={tag} className="text-[10px] font-semibold text-accent-700 bg-accent-50 px-[6px] py-[2px] rounded-full">
                            #{tag.replace(/^#/, '')}
                          </span>
                        ))}
                        {extra > 0 && <span className="text-[10px] font-medium text-muted">+{extra}</span>}
                      </div>
                    )}

                    <div className="flex items-center gap-[6px] flex-wrap">
                      {fbCfg ? (
                        <span className={`text-[10.5px] font-bold px-[8px] py-[4px] rounded-[6px] ${fbCfg.badgeCls}`}>
                          {fbCfg.icon} {fb === 'approve' ? 'Approved' : fbCfg.label}
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-bold px-[8px] py-[4px] rounded-[6px] bg-bg text-muted border border-border">
                          ⏳ Waiting for Review
                        </span>
                      )}
                      {item.critic_score !== null && isReviewed && (
                        <span className={`text-[10.5px] font-semibold px-[8px] py-[4px] rounded-[6px] ${
                          item.critic_score >= 8 ? 'bg-good-bg text-good' :
                          item.critic_score >= 6 ? 'bg-[#fff3e6] text-orange' : 'bg-[#fbe9ec] text-bad'
                        }`}>
                          AI {item.critic_score.toFixed(1)}/10
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[#cbd5e1] text-[18px] flex-shrink-0 self-center font-light">›</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="pb-10" />

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 flex items-center gap-2 px-5 py-[11px] rounded-[13px] shadow-md text-[13px] font-bold text-white pointer-events-none whitespace-nowrap ${
            toast.ok ? 'bg-good' : 'bg-bad'
          }`}
        >
          <span>{toast.ok ? '✓' : '⚠'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ── Review Modal ───────────────────────────────────────────────────── */}
      {selectedItem && (() => {
        const isReviewed = selectedItem.owner_verdict !== null
        const fb         = selectedItem.owner_feedback as FeedbackOption | null
        const fbCfg      = fb ? FEEDBACK[fb] : null
        const score      = selectedItem.critic_score

        return (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            style={{ backgroundColor: 'rgba(15,23,42,0.50)' }}
            onClick={closeModal}
          >
            <div
              className="bg-white rounded-t-[24px] max-h-[93vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-[2px] flex-shrink-0">
                <div className="w-9 h-[4px] bg-border rounded-full" />
              </div>

              {/* Sticky header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
                {/* Prev / position / Next */}
                <div className="flex items-center gap-[2px] flex-shrink-0">
                  <button
                    onClick={() => hasPrev && navigateTo(displayItems[currentDisplayIdx - 1])}
                    disabled={!hasPrev}
                    aria-label="Previous post"
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-bg text-muted text-[18px] border-0 cursor-pointer hover:bg-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ‹
                  </button>
                  <span className="text-[10.5px] font-semibold text-muted tabular-nums px-[4px]">
                    {currentDisplayIdx + 1}/{displayItems.length}
                  </span>
                  <button
                    onClick={() => hasNext && navigateTo(displayItems[currentDisplayIdx + 1])}
                    disabled={!hasNext}
                    aria-label="Next post"
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-bg text-muted text-[18px] border-0 cursor-pointer hover:bg-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ›
                  </button>
                </div>

                {/* Title + reviewed badge */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-text m-0">
                    Post #{String(selectedIndex + 1).padStart(2, '0')}
                  </p>
                  {isReviewed && (
                    <span className="text-[10px] font-bold px-[7px] py-[3px] rounded-full bg-good-bg text-good border border-good/20 flex-shrink-0">
                      ✓ Reviewed
                    </span>
                  )}
                </div>

                {/* Close */}
                <button
                  onClick={closeModal}
                  disabled={submitting}
                  aria-label="Close"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-bg text-muted text-[15px] border-0 cursor-pointer hover:bg-border transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-5">

                {/* Caption */}
                <div>
                  <div className="flex items-center justify-between mb-[8px]">
                    <SectionLabel>Caption</SectionLabel>
                    <button
                      onClick={copyCaption}
                      className="text-[11px] font-bold text-accent-700 bg-accent-50 px-[9px] py-[4px] rounded-[6px] border-0 cursor-pointer hover:bg-accent/10 transition-colors flex-shrink-0"
                    >
                      {copied ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                  <p className="text-[13.5px] font-medium text-text leading-[1.65] m-0 break-words">{selectedItem.content}</p>
                </div>

                {/* Hashtags */}
                {selectedItem.hashtags.length > 0 && (
                  <div>
                    <SectionLabel>Hashtags</SectionLabel>
                    <div className="flex flex-wrap gap-[5px]">
                      {selectedItem.hashtags.map(tag => (
                        <span key={tag} className="text-[10.5px] font-semibold text-accent-700 bg-accent-50 px-[8px] py-[4px] rounded-full">
                          #{tag.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Critic Score */}
                {score !== null && (
                  <div className="bg-bg rounded-[14px] px-4 py-[14px]">
                    <SectionLabel>AI Critic Score</SectionLabel>
                    <div className="flex items-end gap-3 mb-3">
                      <p className="text-[30px] font-extrabold text-text m-0 leading-none tabular-nums">
                        {score.toFixed(1)}<span className="text-[14px] font-medium text-muted"> /10</span>
                      </p>
                      {selectedItem.critic_verdict && (
                        <span className={`text-[11px] font-bold px-[9px] py-[4px] rounded-[7px] mb-[3px] ${
                          selectedItem.critic_verdict === 'good' ? 'bg-good-bg text-good' : 'bg-[#fbe9ec] text-bad'
                        }`}>
                          {selectedItem.critic_verdict === 'good' ? '✓ Good' : '⚠ Needs Work'}
                        </span>
                      )}
                    </div>
                    <ScoreBar score={score} />
                    <p className="text-[10.5px] font-medium text-muted m-0 mt-[6px]">
                      {score >= 8 ? 'High quality — ready to publish' :
                       score >= 6 ? 'Acceptable — minor improvements possible' :
                       'Below threshold — significant revision needed'}
                    </p>
                  </div>
                )}

                <div className="border-t border-border" />

                {/* Feedback */}
                {isReviewed ? (
                  <div>
                    <SectionLabel>Your Feedback</SectionLabel>
                    {fbCfg && fb && (
                      <div className={`inline-flex items-center gap-2 px-3 py-[8px] rounded-[10px] mb-3 ${fbCfg.badgeCls}`}>
                        <span className="text-[16px]">{fbCfg.icon}</span>
                        <span className="text-[13px] font-bold">{fb === 'approve' ? 'Approved' : fbCfg.label}</span>
                      </div>
                    )}
                    {selectedItem.owner_comments ? (
                      <div className="bg-bg rounded-[12px] px-4 py-3 mb-3">
                        <p className="text-[12.5px] font-medium text-text m-0 leading-[1.55]">{selectedItem.owner_comments}</p>
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted m-0 mb-3">No comments added.</p>
                    )}
                    {reviewTimes[selectedItem.id] && (
                      <p className="text-[10.5px] font-medium text-muted m-0">
                        Reviewed {formatReviewTime(reviewTimes[selectedItem.id])}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between mb-[10px]">
                      <SectionLabel>Your Feedback</SectionLabel>
                    </div>

                    {/* Feedback buttons */}
                    <div className="flex flex-col gap-[7px] mb-4">
                      {(Object.entries(FEEDBACK) as [FeedbackOption, typeof FEEDBACK[FeedbackOption]][]).map(([value, cfg]) => (
                        <button
                          key={value}
                          onClick={() => setFeedback(value)}
                          className={[
                            'w-full flex items-center gap-3 px-4 py-[12px] rounded-[12px]',
                            'border-2 text-[13px] font-semibold transition-all duration-150 cursor-pointer',
                            feedback === value
                              ? cfg.selectedCls
                              : `border-border text-text bg-white ${cfg.hoverCls}`,
                          ].join(' ')}
                        >
                          <span className="text-[18px] flex-shrink-0">{cfg.icon}</span>
                          <span className="flex-1 text-left">{cfg.label}</span>
                          {feedback === value && <span className="text-[11px] font-bold opacity-60">Selected ✓</span>}
                        </button>
                      ))}
                    </div>

                    {/* Keyboard hints */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
                      {[['A', 'Approve'], ['N', 'Needs Changes'], ['R', 'Reject'], ['Esc', 'Close']].map(([key, label]) => (
                        <span key={key} className="flex items-center gap-[4px] text-[10.5px] text-muted">
                          <KbdKey>{key}</KbdKey> {label}
                        </span>
                      ))}
                    </div>

                    {/* Comments */}
                    <textarea
                      value={comments}
                      onChange={e => setComments(e.target.value)}
                      placeholder="Add comments (optional)…"
                      rows={3}
                      disabled={submitting}
                      className="w-full border border-border rounded-[12px] px-4 py-[10px] text-[13px] font-medium text-text placeholder:text-muted resize-none focus:outline-none focus:border-orange/50 transition-colors disabled:opacity-50 mb-1"
                    />

                    {modalError && <p className="text-bad text-[12px] font-medium mb-2 m-0">{modalError}</p>}

                    <button
                      onClick={submitFeedback}
                      disabled={!feedback || submitting}
                      className="w-full bg-orange text-white rounded-[13px] py-[14px] text-[14px] font-bold mt-2 border-0 cursor-pointer hover:brightness-105 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-card-sm"
                    >
                      {submitting ? 'Saving…' : 'Submit Feedback'}
                    </button>
                  </div>
                )}
              </div>

              <div className="pb-6 flex-shrink-0" />
            </div>
          </div>
        )
      })()}
    </div>
  )
}
