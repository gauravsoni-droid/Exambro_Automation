'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { QueueItem, QueueStats } from '../types'
import SegControl from '../components/SegControl'
import PillarBar from '../components/PillarBar'

const SEG_OPTIONS = [
  { label: 'Weekly glance', value: 'weekly' },
  { label: 'Growth', value: 'growth' },
]

const PILLAR_COLORS = ['#2b88ca', '#f58645', '#058e6e', '#6b53c4', '#c2415c', '#e67333']

export default function Insights() {
  const [view, setView] = useState<'weekly' | 'growth'>('weekly')
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, q] = await Promise.all([
        api.get<QueueStats>('/queue/stats'),
        api.get<QueueItem[]>('/queue'),
      ])
      setStats(s)
      setItems(q)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load insights')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const published = items.filter((i) => i.status === 'saved')
  const recent = published.slice(0, 3)

  // Build a 21-day consistency grid
  const today = new Date()
  const grid = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (20 - i))
    const ds = d.toISOString().slice(0, 10)
    const hasPost = published.some((p) => p.topics?.round_date === ds)
    return hasPost ? 'on' : 'miss'
  })

  const qualityPct = stats ? Math.round(stats.approve_no_edit_rate * 100) : null
  const totalPosts = stats?.tap2_total ?? 0

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">Insights</h1>
        <p className="text-[12.5px] font-medium text-muted m-0 leading-snug">
          A weekly glance. The numbers quietly shape your daily topics — you never have to act here.
        </p>
      </div>

      {error && <p className="text-bad text-[0.88rem] my-2">{error}</p>}

      <SegControl options={SEG_OPTIONS} value={view} onChange={(v) => setView(v as 'weekly' | 'growth')} className="mb-4" />

      {/* ── Weekly Glance ─────────────────────────────── */}
      {view === 'weekly' && (
        <div>
          {/* Strategy focus card */}
          <div className="bg-gradient-to-br from-[#fff7ea] to-[#fce7d2] border border-[#f1d6ab] rounded-xl p-4 mb-[14px] shadow-card-sm">
            <div className="flex items-center gap-[9px] mb-[9px] flex-wrap">
              <span className="text-[9.5px] font-extrabold uppercase tracking-[.1em] text-white bg-orange-600 px-2 py-[5px] rounded-[6px]">
                This week's focus
              </span>
              <span className="text-[11px] font-bold text-orange-600">📅 Auto-adjusted from your pillar mix</span>
            </div>
            <h3 className="text-[19px] font-extrabold text-text leading-[1.2] m-0 mb-[6px]">
              Keep posting consistently
            </h3>
            <p className="text-[12.5px] font-medium text-text-2 m-0 leading-[1.55]">
              Your strongest results come from staying regular. The AI picks topics to keep your feed balanced across your pillars.
            </p>
          </div>

          {/* What's working */}
          <div className="bg-white border border-border rounded-xl p-4 mb-[14px] shadow-card-sm">
            <div className="flex items-center gap-[9px] mb-[11px]">
              <div className="w-[30px] h-[30px] rounded-[9px] bg-good-bg flex items-center justify-center text-[15px] flex-shrink-0">📈</div>
              <h3 className="text-[14.5px] font-bold text-text m-0 leading-tight">What's working for you</h3>
              <span className="ml-auto text-[10.5px] font-semibold text-muted bg-bg px-2 py-[5px] rounded-[7px] flex-shrink-0">
                {totalPosts} posts
              </span>
            </div>

            {recent.length > 0 ? (
              <>
                {recent.map((p, i) => {
                  const score = p.critic_score
                  return (
                    <div key={p.id} className={`flex items-center gap-[10px] py-[10px] ${i > 0 ? 'border-t border-border' : ''}`}>
                      <p className="flex-1 text-[12.5px] font-semibold text-text m-0 leading-snug">
                        {p.topics?.title ?? p.id.slice(0, 8)}
                      </p>
                      {score != null && (
                        <span className="text-[12px] font-bold text-good whitespace-nowrap">
                          Critic {score}/10
                        </span>
                      )}
                    </div>
                  )
                })}
                <div className="bg-good-bg rounded-[12px] px-3 py-[11px] mt-[13px]">
                  <p className="text-[12px] font-medium text-[#1f6b49] m-0 leading-[1.55]">
                    💡 <b>Keep approving posts</b> — consistency is what builds your audience over time.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-muted m-0">Approve a few posts to see what's landing well.</p>
            )}
          </div>

          {/* Competitor trends — placeholder */}
          <div className="bg-white border border-border rounded-xl p-4 mb-[14px] shadow-card-sm">
            <div className="flex items-center gap-[9px] mb-[11px]">
              <div className="w-[30px] h-[30px] rounded-[9px] bg-orange-50 flex items-center justify-center text-[15px] flex-shrink-0">🔥</div>
              <h3 className="text-[14.5px] font-bold text-text m-0 leading-tight">Trending with competitors</h3>
              <span className="ml-auto text-[10.5px] font-semibold text-muted bg-bg px-2 py-[5px] rounded-[7px] flex-shrink-0">
                Coming soon
              </span>
            </div>
            <p className="text-[12.5px] font-medium text-muted m-0 leading-[1.55]">
              Add competitor Instagram handles in Settings to see what topics are trending in your niche.
            </p>
          </div>

          {/* Pillar mix */}
          {stats && Object.keys(stats.pillar_balance).length > 0 && (
            <div className="bg-white border border-border rounded-xl p-4 mb-[14px] shadow-card-sm">
              <div className="flex items-center gap-[9px] mb-[13px]">
                <div className="w-[30px] h-[30px] rounded-[9px] bg-accent-50 flex items-center justify-center text-[15px] flex-shrink-0">🧱</div>
                <h3 className="text-[14.5px] font-bold text-text m-0 leading-tight">Pillar mix</h3>
                <span className="ml-auto text-[10.5px] font-semibold text-muted bg-bg px-2 py-[5px] rounded-[7px] flex-shrink-0">
                  All time
                </span>
              </div>
              <PillarBar balance={stats.pillar_balance} />
            </div>
          )}

          <p className="text-center text-[11px] font-medium text-muted px-3 pb-2 leading-[1.6]">
            You never have to act here. These insights quietly shape the three topics you pick from each morning.
          </p>
        </div>
      )}

      {/* ── Growth ───────────────────────────────────── */}
      {view === 'growth' && (
        <div>
          {/* Followers — placeholder */}
          <div className="bg-white border border-border rounded-xl p-4 mb-[14px] shadow-card-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted m-0">Followers</p>
              <span className="text-[11px] font-bold text-good bg-good-bg px-2 py-[5px] rounded-[7px]">
                Connect Instagram
              </span>
            </div>
            <p className="text-[12.5px] text-muted m-0 mt-2 leading-snug">
              Follower growth data will appear here once your Instagram account is connected in Settings.
            </p>
          </div>

          {/* Posting consistency */}
          <div className="bg-white border border-border rounded-xl p-4 mb-[14px] shadow-card-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted m-0">Posting consistency</p>
              <span className="text-[11px] font-bold text-good bg-good-bg px-2 py-[5px] rounded-[7px]">
                {grid.filter((d) => d === 'on').length} / 21 days
              </span>
            </div>
            <div className="grid gap-[6px] mt-3" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {grid.map((state, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-[6px] ${
                    state === 'on' ? 'bg-good' : state === 'miss' ? 'bg-[#f0d3d9]' : 'bg-border'
                  }`}
                />
              ))}
            </div>
            <p className="text-[11.5px] font-semibold text-muted mt-[11px] m-0 leading-snug">
              {grid.filter((d) => d === 'on').length > 14
                ? 'Strong consistency. Keep the streak going.'
                : 'Pick a topic daily to build your posting streak.'}
            </p>
          </div>

          {/* Quality */}
          {qualityPct !== null && (
            <div className="bg-white border border-border rounded-xl p-4 mb-[14px] shadow-card-sm">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted m-0">Quality · approved without edits</p>
              </div>
              <p className="text-[30px] font-extrabold text-text tracking-tight leading-none mt-2">{qualityPct}%</p>
              <div className="relative h-[11px] rounded-[6px] bg-bg mt-3 overflow-hidden">
                <div
                  className="h-full rounded-[6px] bg-gradient-to-r from-good to-[#46b98a]"
                  style={{ width: `${qualityPct}%` }}
                />
                {/* 90% target line */}
                <div className="absolute top-[-4px] bottom-[-4px] w-[2.5px] bg-text rounded-[2px]" style={{ left: '90%' }} />
              </div>
              <p className="text-[11.5px] font-semibold text-muted mt-[11px] m-0 leading-snug">
                {qualityPct >= 90
                  ? `Above your 90% target (the dark line). The critic is doing its job.`
                  : `Below the 90% target (dark line). Use the tweak feature to guide the AI.`}
              </p>
            </div>
          )}

          {/* Saves & shares — placeholder */}
          <div className="bg-white border border-border rounded-xl p-4 mb-[14px] shadow-card-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold uppercase tracking-[.1em] text-muted m-0">Saves &amp; shares</p>
              <span className="text-[11px] font-bold text-muted bg-bg px-2 py-[5px] rounded-[7px]">Coming soon</span>
            </div>
            <p className="text-[12.5px] text-muted m-0 mt-2 leading-snug">
              Engagement metrics appear here once Instagram publishing is connected.
            </p>
          </div>

          <p className="text-center text-[11px] font-medium text-muted px-3 pb-2 leading-[1.6]">
            Growth and consistency — the two things that actually matter. Everything else stays out of your way.
          </p>
        </div>
      )}
    </div>
  )
}
