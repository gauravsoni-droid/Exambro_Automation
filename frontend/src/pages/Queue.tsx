'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, ApiError } from '../lib/api'
import type { QueueItem, QueueStats } from '../types'
import PillarBar from '../components/PillarBar'

// 3-letter abbreviation from a topic title
function thumb(title: string) {
  const words = title.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0] + (words[2]?.[0] ?? '')).toUpperCase()
  return title.slice(0, 3).toUpperCase()
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  saved:    { bg: 'bg-good-bg',    text: 'text-good',        label: 'Published' },
  rejected: { bg: 'bg-[#fde8e8]', text: 'text-bad',         label: 'Rejected' },
  awaiting_approval: { bg: 'bg-accent-50', text: 'text-accent-700', label: 'Pending' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: 'bg-bg', text: 'text-muted', label: status }
  return (
    <span className={`text-[9.5px] font-bold uppercase tracking-[.04em] px-[7px] py-1 rounded-[6px] ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

export default function Queue() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.get<QueueItem[]>('/queue'), api.get<QueueStats>('/queue/stats')])
      .then(([q, s]) => { setItems(q); setStats(s) })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load history'))
  }, [])

  const published = items.filter((i) => i.status === 'saved')

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">History</h1>
        <p className="text-[12.5px] font-medium text-muted m-0 leading-snug">
          Everything you've approved, and how your themes are balancing out.
        </p>
      </div>

      {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}

      {/* Pillar balance */}
      {stats && Object.keys(stats.pillar_balance).length > 0 && (
        <div className="bg-white border border-border rounded-[16px] px-4 py-[15px] mb-[18px] shadow-card-sm">
          <div className="flex items-center justify-between mb-[13px]">
            <p className="text-[12px] font-bold text-text m-0">This week's mix</p>
            <span className="text-[12px] font-semibold text-muted">{published.length} posts</span>
          </div>
          <PillarBar balance={stats.pillar_balance} />
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-[9px] mb-[18px]">
          {[
            { n: `${Math.round(stats.approve_no_edit_rate * 100)}%`, label: 'approved without edits' },
            { n: `${Math.round(stats.edit_rate * 100)}%`,            label: 'edit rate (tweaks)' },
            { n: String(stats.tap2_total),                           label: 'posts reviewed' },
          ].map(({ n, label }) => (
            <div key={label} className="bg-white border border-border rounded-[16px] px-3 py-[14px] shadow-card-sm text-center">
              <p className="text-[1.8rem] font-extrabold text-accent-700 m-0 leading-none mb-1">{n}</p>
              <p className="text-[11px] font-medium text-muted m-0 leading-snug">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent posts list */}
      {items.length > 0 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted mb-[10px]">Recent posts</p>
          {items.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-white border border-border rounded-[13px] px-[13px] py-[11px] mb-[9px] shadow-card-sm"
            >
              {/* Thumbnail */}
              <div className="w-11 h-11 rounded-[10px] bg-gradient-to-br from-[#33425f] to-[#1a2b4a] flex items-center justify-center text-white text-[11px] font-extrabold flex-shrink-0">
                {p.topics?.title ? thumb(p.topics.title) : '···'}
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-bold text-text m-0 mb-[5px] leading-tight truncate">
                  {p.topics?.title ?? p.id.slice(0, 8)}
                </p>
                <div className="flex items-center gap-[7px] flex-wrap">
                  <StatusBadge status={p.status} />
                  <span className="text-[11px] font-medium text-muted">
                    {p.topics?.round_date ?? '—'}
                    {p.topics?.pillars?.name ? ` · ${p.topics.pillars.name}` : ''}
                  </span>
                  {p.critic_score != null && (
                    <span className="text-[11px] font-medium text-muted">Critic {p.critic_score}/10</span>
                  )}
                </div>
              </div>

              {/* Link to review */}
              <Link
                href={`/review/${p.id}`}
                className="text-accent text-[11px] font-bold flex items-center gap-[3px] no-underline hover:text-accent-700 flex-shrink-0 whitespace-nowrap"
              >
                ↗ View
              </Link>
            </div>
          ))}
        </>
      )}

      {items.length === 0 && !error && (
        <p className="text-[13px] text-muted text-center py-8">
          No posts yet — pick your first topic on the Today screen.
        </p>
      )}
    </div>
  )
}
