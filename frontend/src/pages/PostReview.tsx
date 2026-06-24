'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, ApiError } from '../lib/api'
import { mediaUrl } from '../lib/supabase'
import type { Post } from '../types'
import TapTracker from '../components/TapTracker'
import TopicPill from '../components/TopicPill'

const GENERATING = new Set(['topic_chosen', 'generating', 'content_ready'])

const GEN_STEPS = [
  { label: 'Writing caption & hashtags' },
  { label: 'Brand & quality check' },
  { label: 'Creating the image' },
]

function CriticScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? 'bg-good-bg text-good border-good/30' :
    score >= 6 ? 'bg-orange-50 text-orange-600 border-orange/30' :
                 'bg-[#fbe9ec] text-bad border-[#f3d4da]'
  return (
    <span className={`text-[12px] font-bold px-[10px] py-[4px] rounded-[8px] border ${color}`}>
      AI score {score}/10
    </span>
  )
}

export default function PostReview() {
  const params = useParams()
  const postId = params?.postId as string | undefined
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tweak, setTweak] = useState('')
  const [tweakOpen, setTweakOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      const p = postId
        ? await api.get<Post>(`/posts/${postId}`)
        : await api.get<Post | null>('/posts/current')
      setPost(p)
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load post')
      timer.current = setTimeout(load, 5000)
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (post && GENERATING.has(post.status)) {
      timer.current = setTimeout(load, 5000)
    }
    return () => clearTimeout(timer.current)
  }, [post, load])

  async function act(action: 'approve' | 'reject' | 'retry') {
    if (!post || busy) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/posts/${post.id}/${action}`)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `${action} failed`)
    } finally {
      setBusy(false)
    }
  }

  async function regenerateImages() {
    if (!post || busy) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/posts/${post.id}/regenerate-images`)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Image regenerate failed')
    } finally {
      setBusy(false)
    }
  }

  async function sendTweak() {
    if (!post || busy || !tweak.trim()) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/posts/${post.id}/tweak`, { instruction: tweak.trim() })
      setTweak('')
      setTweakOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Tweak failed')
    } finally {
      setBusy(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-[54px] h-[54px] rounded-full border-4 border-border border-t-orange animate-spin mb-5" />
        <p className="text-[13px] font-medium text-muted">Loading…</p>
      </div>
    )
  }

  // ── No post ──────────────────────────────────────────────
  if (!post) {
    return (
      <div>
        <TapTracker step={1} />
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-2">Post review</h1>
        <p className="text-[13px] font-medium text-muted m-0">
          No post in flight. Pick a topic on the Today screen first.
        </p>
      </div>
    )
  }

  const generating = GENERATING.has(post.status)
  const isReel = post.format === 'reel'
  const firstGen = generating && !post.caption
  const regeneratingImages = generating && !!post.caption
  const hashtags = post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')

  // DEBUG — remove after image rendering is confirmed
  console.log('[PostReview]', {
    status: post?.status,
    format: post?.format,
    image_paths: post?.image_paths,
    imageCount: post?.image_paths?.length,
    generating,
    regeneratingImages,
    imgCondition: (post?.image_paths?.length ?? 0) > 0 && !regeneratingImages,
    mediaUrlResult: (post?.image_paths?.length ?? 0) > 0
      ? (() => { try { return mediaUrl(post.image_paths[0]) } catch(e) { return String(e) } })()
      : '(no paths)',
  })

  // ── Done state ───────────────────────────────────────────
  if (post.status === 'saved') {
    return (
      <div>
        <TapTracker step={3} />
        <div className="flex flex-col items-center text-center pt-[30px] pb-0">
          <div className="w-[78px] h-[78px] rounded-full bg-good-bg flex items-center justify-center mb-5">
            <svg viewBox="0 0 24 24" fill="none" className="w-[38px] h-[38px]">
              <path d="M20 6L9 17l-5-5" stroke="#058e6e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-[22px] font-extrabold text-text m-0 mb-2 leading-tight">Post approved</h2>
          <p className="text-[13.5px] font-medium text-muted m-0 mb-6 max-w-[250px] leading-[1.6]">
            That's your two taps done. Check back tomorrow for your next topic.
          </p>

          <div className="w-full bg-white border border-border rounded-[16px] px-4 py-[14px] shadow-card-sm text-left flex items-center gap-3 mb-[10px]">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-good-bg flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="#058e6e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold text-text m-0 mb-[3px] leading-tight">Saved and approved</p>
              <p className="text-[12px] font-medium text-muted m-0">Publishing stays manual in Phase 1</p>
            </div>
          </div>

          <div className="w-full bg-white border border-border rounded-[16px] px-4 py-[14px] shadow-card-sm text-left flex items-center gap-3">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-accent-50 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#2b88ca" strokeWidth="2" />
                <path d="M4 7l8 6 8-6" stroke="#2b88ca" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-[13.5px] font-bold text-text m-0 mb-[3px] leading-tight">Next topics arrive tomorrow</p>
              <p className="text-[12px] font-medium text-muted m-0">New ideas ready at 09:00 IST</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Generating (first generation) ───────────────────────
  if (firstGen) {
    return (
      <div>
        <TapTracker step={2} />
        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">Tap 2 of 2 · building your post</p>
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-4">Writing your post…</h1>

        {/* Topic context while generating */}
        {post.topics && (
          <div className="bg-white border border-border rounded-[14px] px-4 py-[12px] shadow-card-sm mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {post.topics.pillars?.name && <TopicPill name={post.topics.pillars.name} />}
              <p className="text-[13px] font-semibold text-text m-0 flex-1 leading-snug">{post.topics.title}</p>
            </div>
          </div>
        )}

        {/* Step progress */}
        <div className="bg-white border border-border rounded-[16px] p-5 shadow-card-sm mb-4">
          <div className="flex flex-col gap-[14px]">
            {GEN_STEPS.map((s, i) => {
              const active = post.status === 'topic_chosen' ? i === 0 :
                             post.status === 'generating'    ? i === 1 : i === 2
              const done = post.status === 'content_ready' ? i < 2 :
                           post.status === 'generating'    ? i === 0 : false
              const pending = !active && !done
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
                    'text-[13px] font-semibold',
                    done ? 'text-good line-through' : active ? 'text-text' : 'text-muted',
                  ].join(' ')}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-[12px] font-semibold text-muted m-0 px-1">⏱ Usually takes 20–40 seconds — keep this tab open.</p>

        {post.status === 'topic_chosen' && (
          <button
            onClick={() => act('retry')}
            disabled={busy}
            className="mt-4 w-full border border-border rounded-[12px] px-4 py-[11px] text-[13px] font-semibold text-muted bg-white cursor-pointer hover:border-border-strong transition-colors"
          >
            ↻ Retry generation
          </button>
        )}
      </div>
    )
  }

  // ── Reel script ──────────────────────────────────────────
  if (isReel) {
    return (
      <div>
        <TapTracker step={2} />
        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">Tap 2 of 2 · reel</p>
        <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-3">Reel script</h1>
        {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}
        <div className="bg-[#f3f7fb] border border-[#dde7f1] rounded-[14px] p-[13px]">
          <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-accent-700 m-0 mb-2">🎬 Script · 1 min — for manual shoot</p>
          <p className="text-[13px] font-medium text-text whitespace-pre-wrap leading-[1.7] m-0">{post.script}</p>
        </div>
      </div>
    )
  }

  // ── Review post (awaiting approval) ─────────────────────
  return (
    <div>
      <TapTracker step={2} />

      <p className="text-[11px] font-bold uppercase tracking-[.14em] text-orange-600 m-0 mb-[6px]">Tap 2 of 2 · almost done</p>
      <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight m-0 mb-1">Approve today's post</h1>
      <p className="text-[13px] font-medium text-muted m-0 mb-4 leading-[1.5]">
        Review what the AI wrote. Tweak anything, then approve.
      </p>

      {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}

      {/* ── Topic context strip ────────────────────────────── */}
      {post.topics && (
        <div className="bg-white border border-border rounded-[14px] px-4 py-[12px] shadow-card-sm mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted mb-[6px]">Topic</p>
          <div className="flex items-start gap-2 flex-wrap">
            {post.topics.pillars?.name && <TopicPill name={post.topics.pillars.name} />}
            <p className="text-[14px] font-bold text-text m-0 flex-1 leading-snug min-w-0">{post.topics.title}</p>
          </div>
        </div>
      )}

      {/* ── Image card ────────────────────────────────────── */}
      <div className="bg-white border border-border rounded-[16px] overflow-hidden shadow-card mb-3">
        {/* Image header */}
        <div className="relative h-[208px] bg-gradient-to-br from-[#2f4a7a] to-[#1a2b4a] flex flex-col justify-center px-6 overflow-hidden">
          <div className="absolute right-[-40px] bottom-[-50px] w-[170px] h-[170px] rounded-full bg-gradient-radial from-orange/50 to-transparent opacity-50 pointer-events-none" />

          {post.image_paths.length > 0 && !regeneratingImages ? (
            <img
              src={mediaUrl(post.image_paths[0])}
              alt="generated"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <>
              <span className="text-[11px] font-bold uppercase tracking-[.18em] text-orange mb-[10px] relative">
                {post.topics?.pillars?.name ?? 'Content'}
              </span>
              <span className="text-[22px] font-extrabold text-white leading-tight relative tracking-tight">
                {post.topics?.title ?? 'Your post'}
              </span>
            </>
          )}

          {regeneratingImages && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a2b4a]/80">
              {post.status !== 'topic_chosen' && (
                <div className="w-8 h-8 rounded-full border-4 border-white/30 border-t-white animate-spin mb-3" />
              )}
              <p className="text-white text-[12px] font-semibold">
                {post.status === 'topic_chosen' ? 'Generation failed' : 'Regenerating image…'}
              </p>
              {post.status === 'topic_chosen' && (
                <button
                  onClick={() => act('retry')}
                  disabled={busy}
                  className="mt-3 px-4 py-1.5 rounded-full bg-white/20 text-white text-[11px] font-semibold hover:bg-white/30 disabled:opacity-50"
                >
                  ↻ Retry
                </button>
              )}
            </div>
          )}

          {post.status === 'awaiting_approval' && (
            <button
              onClick={regenerateImages}
              disabled={busy}
              className="absolute bottom-3 left-3 flex items-center gap-[6px] text-[11px] font-bold text-white bg-black/35 backdrop-blur-sm border border-white/28 px-[11px] py-2 rounded-[9px] cursor-pointer hover:bg-black/55 transition-colors disabled:opacity-50"
            >
              ↻ Regenerate image
            </button>
          )}

          {post.image_paths.length > 1 && (
            <span className="absolute top-3 right-3 text-[9.5px] font-bold text-white bg-white/14 backdrop-blur-sm px-2 py-[5px] rounded-[6px]">
              {post.image_paths.length} images
            </span>
          )}
        </div>

        {/* Card body */}
        <div className="px-4 pt-4 pb-[16px]">

          {/* AI score + critic checks */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {post.critic_score != null && <CriticScoreBadge score={post.critic_score} />}
          </div>

          <div className="flex flex-col gap-[5px] mb-4 pb-4 border-b border-border">
            {['Brand voice ✓', 'No over-promises ✓', 'Pillar fit ✓'].map((check) => (
              <div key={check} className="flex items-center gap-[7px]">
                <span className="w-[16px] h-[16px] rounded-full bg-good flex items-center justify-center text-white text-[10px] flex-shrink-0 font-bold">✓</span>
                <span className="text-[12px] font-semibold text-good">{check.replace(' ✓', '')}</span>
              </div>
            ))}
          </div>

          {/* Caption */}
          {post.caption && (
            <div className="mb-[14px]">
              <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted mb-[7px] m-0">Caption</p>
              <p className="text-[14px] font-medium text-text whitespace-pre-wrap leading-[1.62] m-0">{post.caption}</p>
            </div>
          )}

          {/* Hashtags */}
          {hashtags && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted mb-[7px] m-0">Hashtags</p>
              <div className="flex flex-wrap gap-[6px]">
                {post.hashtags.map((h) => (
                  <span key={h} className="text-[12px] font-semibold text-accent bg-accent-50 px-2 py-[5px] rounded-[7px]">
                    {h.startsWith('#') ? h : `#${h}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Actions ───────────────────────────────────────── */}
      {post.status === 'awaiting_approval' && (
        <>
          {/* Tweak panel */}
          {tweakOpen ? (
            <div className="bg-white border border-border rounded-[16px] p-[14px] mb-3 shadow-card-sm">
              <label className="block text-[12px] font-bold text-text mb-2">What should change?</label>
              <textarea
                value={tweak}
                onChange={(e) => setTweak(e.target.value)}
                placeholder="e.g. make the hook stronger, add more urgency…"
                className="w-full border-[1.5px] border-border rounded-[11px] px-3 py-[11px] text-[13px] font-medium text-text resize-none h-[64px] outline-none focus:border-orange transition-colors"
              />
              <div className="flex gap-2 mt-[10px]">
                <button
                  onClick={() => { setTweakOpen(false); setTweak('') }}
                  className="flex-1 bg-white border-[1.5px] border-border text-muted rounded-[11px] py-[11px] text-[13px] font-bold cursor-pointer hover:border-border-strong transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendTweak}
                  disabled={busy || !tweak.trim()}
                  className="flex-1 bg-text text-white rounded-[11px] py-[11px] text-[13px] font-bold cursor-pointer hover:bg-navy transition-colors disabled:opacity-50"
                >
                  Send &amp; rewrite
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setTweakOpen(true)}
              className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold text-accent bg-accent-50 rounded-[12px] px-4 py-[11px] mb-3 cursor-pointer hover:bg-[#d8eaf7] transition-colors border-0"
            >
              ✨ Ask AI to rewrite part of this
            </button>
          )}

          {/* Approve / Reject */}
          <div className="flex flex-col gap-[9px]">
            <button
              onClick={() => act('approve')}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-orange to-orange-600 text-white rounded-[14px] py-[16px] text-[15px] font-bold cursor-pointer shadow-[0_8px_20px_rgba(245,134,69,.36)] hover:brightness-105 active:scale-[.98] transition-all disabled:opacity-50 border-0"
            >
              ✓ Approve &amp; save
            </button>
            <button
              onClick={() => act('reject')}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-white border-[1.5px] border-border text-[#c2415c] rounded-[14px] py-[14px] text-[13.5px] font-bold cursor-pointer hover:border-[#c2415c] active:scale-[.98] transition-all disabled:opacity-50"
            >
              Not this one
            </button>
          </div>
        </>
      )}

      {post.status === 'rejected' && (
        <div className="text-center mt-4 bg-white border border-border rounded-[14px] px-4 py-5">
          <p className="text-[13px] font-semibold text-muted m-0 mb-1">Post rejected.</p>
          <p className="text-[12px] text-muted m-0">Go to Today to pick a different topic.</p>
        </div>
      )}
    </div>
  )
}
