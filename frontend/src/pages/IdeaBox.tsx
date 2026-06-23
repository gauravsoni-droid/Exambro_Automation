'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { Idea, IdeaType } from '../types'


function pillStyle(name: string) {
  const n = name.toLowerCase()
  if (n.includes('news') || n.includes('exam')) return { bg: 'bg-[#eaf1fa]', text: 'text-accent-700', active: 'bg-accent-700 text-white border-accent-700' }
  if (n.includes('tip') || n.includes('study') || n.includes('strat')) return { bg: 'bg-[#eee9fb]', text: 'text-[#6b53c4]', active: 'bg-[#6b53c4] text-white border-[#6b53c4]' }
  if (n.includes('pyq') || n.includes('concept') || n.includes('topic')) return { bg: 'bg-orange-50', text: 'text-orange-600', active: 'bg-orange text-white border-orange' }
  if (n.includes('motiv') || n.includes('inspir')) return { bg: 'bg-[#e9f5ef]', text: 'text-good', active: 'bg-good text-white border-good' }
  if (n.includes('product') || n.includes('app')) return { bg: 'bg-[#fbe9ec]', text: 'text-[#c2415c]', active: 'bg-[#c2415c] text-white border-[#c2415c]' }
  return { bg: 'bg-bg', text: 'text-muted', active: 'bg-text text-white border-text' }
}

const PILLARS = ['Exam news', 'Study tips', 'PYQ / concept', 'Motivation', 'Product / app']

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d} days ago`
}

export default function IdeaBox() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [type, setType] = useState<IdeaType>('text')
  const [payload, setPayload] = useState('')
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null)
  const [historyTab, setHistoryTab] = useState<'used' | 'discarded'>('used')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setIdeas(await api.get<Idea[]>('/ideas'))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load ideas')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function add(e: { preventDefault(): void }) {
    e.preventDefault()
    if (busy || !payload.trim()) return
    setBusy(true)
    setError('')
    try {
      await api.post('/ideas', { type, payload: payload.trim(), pillar_name: selectedPillar ?? null })
      setPayload('')
      setSelectedPillar(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Add failed')
    } finally {
      setBusy(false)
    }
  }

  async function discard(id: string) {
    try {
      await api.delete(`/ideas/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Discard failed')
    }
  }

  const pending = ideas.filter((i) => i.status === 'pending')
  const usedItems = ideas.filter((i) => i.status === 'used')
  const discardedItems = ideas.filter((i) => i.status === 'discarded')
  const historyItems = historyTab === 'used' ? usedItems : discardedItems

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">Idea box</h1>
        <p className="text-[12.5px] font-medium text-muted m-0 leading-snug">
          Drop a thought here — it jumps to the front of tomorrow's topics.
        </p>
      </div>

      {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}

      {/* ── Pending queue ──────────────────────────────── */}
      {pending.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-[10px]">
            <span className="text-[11px] font-bold uppercase tracking-[.1em] text-muted">In queue</span>
            <span className="text-[11px] font-bold text-white bg-orange px-[7px] py-[2px] rounded-full">{pending.length}</span>
          </div>

          {pending.map((i, idx) => (
            <div key={i.id} className="flex gap-[11px] bg-white border border-border rounded-[13px] p-[13px] mb-[8px] shadow-card-sm">
              {/* Queue position badge */}
              <span className="w-[24px] h-[24px] rounded-full bg-orange text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-[1px]">
                {idx + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium text-text m-0 mb-[7px] leading-[1.45]">{i.payload}</p>

                {/* Meta row: time · type · pillar */}
                <div className="flex items-center gap-[6px] flex-wrap">
                  <span className="text-[11px] font-medium text-muted">
                    {i.created_at ? timeAgo(i.created_at) : 'Added recently'}
                  </span>
                  <span className="text-muted text-[10px]">·</span>
                  <span className="text-[10.5px] font-bold uppercase tracking-[.03em] text-orange-600 bg-orange-50 px-[7px] py-[3px] rounded-[6px]">
                    {i.type}
                  </span>
                  {i.pillar_name && (
                    <span className={`text-[10.5px] font-bold px-[7px] py-[3px] rounded-[6px] ${pillStyle(i.pillar_name).bg} ${pillStyle(i.pillar_name).text}`}>
                      {i.pillar_name}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => discard(i.id)}
                className="text-muted hover:text-bad cursor-pointer text-[17px] font-bold border-0 bg-transparent px-1 flex-shrink-0 leading-none self-start"
                aria-label="Remove from queue"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Add idea form ──────────────────────────────── */}
      <div className="mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted mb-[10px]">Add an idea</p>
        <form onSubmit={add} className="bg-white border border-border rounded-[16px] p-[14px] shadow-card-sm">
          {/* Textarea */}
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder={type === 'text' ? 'Type an idea, describe a topic…' : type === 'link' ? 'https://…' : 'Describe the photo or image idea…'}
            className="w-full border-0 outline-none resize-none h-[64px] text-[14px] font-medium text-text bg-transparent placeholder:text-muted leading-[1.5]"
          />

          {/* Pillar chips */}
          <div className="mt-2 mb-[2px]">
            <span className="block text-[10.5px] font-bold uppercase tracking-[.06em] text-muted mb-[8px]">
              Pillar <span className="normal-case tracking-normal font-semibold text-[10.5px]">· optional</span>
            </span>
            <div className="flex flex-wrap gap-[6px]">
              {PILLARS.map((p) => {
                const s = pillStyle(p)
                const on = selectedPillar === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPillar(on ? null : p)}
                    className={[
                      'border rounded-[9px] px-[10px] py-[7px] text-[11.5px] font-semibold cursor-pointer transition-all duration-150',
                      on ? s.active : `${s.bg} ${s.text} border-border hover:border-orange`,
                    ].join(' ')}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bottom row: type chips + submit */}
          <div className="flex items-center justify-between border-t border-border pt-[11px] mt-[13px]">
            <div className="flex gap-[6px]">
              {(['text', 'link', 'image'] as IdeaType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={[
                    'flex items-center gap-[5px] text-[11px] font-semibold border rounded-[8px] px-[9px] py-[7px] cursor-pointer transition-colors',
                    type === t ? 'bg-text text-white border-text' : 'bg-bg text-muted border-border hover:border-border-strong',
                  ].join(' ')}
                >
                  {t === 'text' ? '✏ Text' : t === 'link' ? '🔗 Link' : '🖼 Photo'}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={busy || !payload.trim()}
              className="bg-text text-white border-0 rounded-[11px] px-4 py-[9px] text-[13px] font-bold cursor-pointer hover:bg-navy transition-colors disabled:opacity-50"
            >
              {busy ? '…' : 'Add →'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Empty state ────────────────────────────────── */}
      {ideas.length === 0 && (
        <div className="text-center py-8">
          <p className="text-[28px] mb-2">💡</p>
          <p className="text-[13px] font-semibold text-muted">No ideas yet</p>
          <p className="text-[12px] text-muted mt-1">Your first idea will jump to slot 1 tomorrow.</p>
        </div>
      )}

      {/* ── History tabs ───────────────────────────────── */}
      {(usedItems.length > 0 || discardedItems.length > 0) && (
        <div className="mt-2">
          <div className="flex gap-2 mb-[10px]">
            {(['used', 'discarded'] as const).map((tab) => {
              const count = tab === 'used' ? usedItems.length : discardedItems.length
              return (
                <button
                  key={tab}
                  onClick={() => setHistoryTab(tab)}
                  className={[
                    'text-[11px] font-bold uppercase tracking-[.1em] px-3 py-[5px] rounded-[8px] border cursor-pointer transition-colors',
                    historyTab === tab
                      ? 'bg-text text-white border-text'
                      : 'bg-transparent text-muted border-border hover:border-border-strong',
                  ].join(' ')}
                >
                  {tab} ({count})
                </button>
              )
            })}
          </div>

          {historyItems.length === 0 && (
            <p className="text-[12px] text-muted text-center py-4">Nothing here yet.</p>
          )}

          {historyItems.map((i) => (
            <div key={i.id} className="flex gap-[11px] bg-white border border-border rounded-[13px] p-[13px] mb-[8px] shadow-card-sm opacity-60">
              <span className={`w-[20px] h-[20px] rounded-full mt-[2px] flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold ${i.status === 'used' ? 'bg-good' : 'bg-bad'}`}>
                {i.status === 'used' ? '✓' : '×'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-text m-0 mb-[5px] leading-[1.45] line-through">{i.payload}</p>
                <div className="flex items-center gap-[6px] flex-wrap">
                  <span className={`text-[10px] font-bold uppercase tracking-[.03em] px-[7px] py-[3px] rounded-[6px] ${i.status === 'used' ? 'text-good bg-good-bg' : 'text-bad bg-[#fde8e8]'}`}>
                    {i.status}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[.03em] text-orange-600 bg-orange-50 px-[7px] py-[3px] rounded-[6px]">
                    {i.type}
                  </span>
                  {i.pillar_name && (
                    <span className={`text-[10px] font-bold px-[7px] py-[3px] rounded-[6px] ${pillStyle(i.pillar_name).bg} ${pillStyle(i.pillar_name).text}`}>
                      {i.pillar_name}
                    </span>
                  )}
                  {i.used_at && (
                    <span className="text-[10px] text-muted">{timeAgo(i.used_at)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
