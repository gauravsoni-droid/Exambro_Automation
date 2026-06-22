'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { Idea, IdeaType } from '../types'

// Pillar chip colors (visual only — pillar_id not in current API)
const CHIP_COLORS: Record<string, string> = {
  'Exam news': '#eaf1fa / text-accent-700',
  'Study tips': '#eee9fb / text-[#6b53c4]',
  'PYQ / concept': '#fdebdd / text-orange-600',
  'Motivation': '#e9f5ef / text-good',
  'Product / app': '#fbe9ec / text-[#c2415c]',
}

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
const _ = CHIP_COLORS // suppress unused warning

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
      await api.post('/ideas', { type, payload: payload.trim() })
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
  const used = ideas.filter((i) => i.status !== 'pending')

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">Idea box</h1>
        <p className="text-[12.5px] font-medium text-muted m-0 leading-snug">
          Got a thought during the day? Drop it here — it jumps to the front of tomorrow's topics.
        </p>
      </div>

      {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}

      {/* Input card */}
      <form onSubmit={add} className="bg-white border border-border rounded-[16px] p-[14px] shadow-card-sm mb-[18px]">
        {/* Textarea */}
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder={type === 'text' ? 'Type an idea, paste a link, or describe a topic…' : 'https://…'}
          className="w-full border-0 outline-none resize-none h-[58px] text-[14px] font-medium text-text bg-transparent placeholder:text-muted leading-[1.5]"
        />

        {/* Pillar chips */}
        <div className="mt-3">
          <span className="block text-[11px] font-bold uppercase tracking-[.06em] text-muted mb-[9px]">
            Pillar <span className="normal-case tracking-normal font-semibold">· optional</span>
          </span>
          <div className="flex flex-wrap gap-[7px]">
            {PILLARS.map((p) => {
              const s = pillStyle(p)
              const on = selectedPillar === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPillar(on ? null : p)}
                  className={[
                    'border rounded-[9px] px-[11px] py-2 text-[12px] font-semibold cursor-pointer transition-all duration-150',
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
          <div className="flex gap-[7px]">
            {(['text', 'link', 'image'] as IdeaType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={[
                  'flex items-center gap-[5px] text-[11.5px] font-semibold border rounded-[9px] px-[9px] py-[7px] cursor-pointer transition-colors',
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
            {busy ? '…' : 'Add idea'}
          </button>
        </div>
      </form>

      {/* Pending ideas */}
      {pending.length > 0 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted mb-[10px]">Waiting to be used</p>
          {pending.map((i) => (
            <div key={i.id} className="flex gap-[11px] bg-white border border-border rounded-[13px] p-[13px] mb-[9px] shadow-card-sm">
              <span className="w-2 h-2 rounded-full bg-orange mt-[5px] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium text-text m-0 mb-[5px] leading-[1.45]">{i.payload}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-medium text-muted">
                    {(i as { created_at?: string }).created_at ? timeAgo((i as { created_at: string }).created_at) : 'Added recently'}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[.03em] text-orange-600 bg-orange-50 px-[7px] py-[3px] rounded-[6px]">
                    {i.type}
                  </span>
                </div>
              </div>
              <button
                onClick={() => discard(i.id)}
                className="text-muted hover:text-bad cursor-pointer text-[17px] font-bold border-0 bg-transparent px-1 flex-shrink-0 leading-none"
                aria-label="Discard idea"
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}

      {/* Used / discarded */}
      {used.length > 0 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted mb-[10px] mt-4">Used &amp; discarded</p>
          {used.map((i) => (
            <div key={i.id} className="flex gap-[11px] bg-white border border-border rounded-[13px] p-[13px] mb-[9px] shadow-card-sm opacity-60">
              <span className={`w-2 h-2 rounded-full mt-[5px] flex-shrink-0 ${i.status === 'used' ? 'bg-good' : 'bg-bad'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium text-text m-0 mb-[5px] leading-[1.45] line-through">{i.payload}</p>
                <span className={`text-[10px] font-bold uppercase tracking-[.03em] px-[7px] py-[3px] rounded-[6px] ${i.status === 'used' ? 'text-good bg-good-bg' : 'text-bad bg-[#fde8e8]'}`}>
                  {i.status}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {ideas.length === 0 && (
        <p className="text-[13px] text-muted text-center py-6">No ideas yet — drop your first one above!</p>
      )}
    </div>
  )
}
