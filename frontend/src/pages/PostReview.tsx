import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { mediaUrl } from '../lib/supabase'
import type { Post } from '../types'

const GENERATING = new Set(['topic_chosen', 'generating', 'content_ready'])

export default function PostReview() {
  const { postId } = useParams()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tweak, setTweak] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      const p = postId
        ? await api.get<Post>(`/posts/${postId}`)
        : await api.get<Post | null>('/posts/current')
      setPost(p)
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load post')
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    load()
  }, [load])

  // Generation takes minutes — poll while in a generating state
  useEffect(() => {
    if (post && GENERATING.has(post.status)) {
      timer.current = window.setTimeout(load, 5000)
    }
    return () => window.clearTimeout(timer.current)
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

  async function sendTweak() {
    if (!post || busy || !tweak.trim()) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/posts/${post.id}/tweak`, { instruction: tweak.trim() })
      setTweak('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Tweak failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="muted">Loading…</p>
  if (!post)
    return (
      <div>
        <h1>Post review</h1>
        <p className="muted">No post in flight. Pick a topic on the Today screen first.</p>
      </div>
    )

  const generating = GENERATING.has(post.status)

  return (
    <div>
      <div className="spread">
        <h1>Post review</h1>
        <div>
          <span className="pill">{post.format ?? '…'}</span>
          <span className={`pill ${post.status === 'saved' ? 'good' : post.status === 'rejected' ? 'bad' : ''}`}>
            {post.status}
          </span>
          {post.critic_score != null && <span className="pill">critic {post.critic_score}/10</span>}
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {generating && (
        <div className="card">
          <p className="muted">
            Writing in progress (writer ⇄ critic{post.format === 'post' ? ' + images' : ''})… this
            page refreshes automatically.
          </p>
          {post.status === 'topic_chosen' && (
            <button className="ghost" onClick={() => act('retry')} disabled={busy}>
              Retry generation
            </button>
          )}
        </div>
      )}

      {post.image_paths.length > 0 && (
        <div className="imgs">
          {post.image_paths.map((p) => (
            <img key={p} src={mediaUrl(p)} alt="generated" />
          ))}
        </div>
      )}

      {post.caption && (
        <div className="card">
          <h2>Caption</h2>
          <p className="caption">{post.caption}</p>
          <p className="hashtags">{post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</p>
        </div>
      )}

      {post.script && (
        <div className="card">
          <h2>Reel script (1 min — for manual shoot)</h2>
          <p className="caption">{post.script}</p>
        </div>
      )}

      {post.status === 'awaiting_approval' && (
        <div className="card">
          <div className="row">
            <button className="success" onClick={() => act('approve')} disabled={busy}>
              Approve
            </button>
            <button className="danger" onClick={() => act('reject')} disabled={busy}>
              Reject
            </button>
          </div>
          <label>Tweak — tell the writer what to change</label>
          <textarea
            value={tweak}
            onChange={(e) => setTweak(e.target.value)}
            placeholder="e.g. hook ko aur strong karo, CTA pehle lao…"
          />
          <p>
            <button onClick={sendTweak} disabled={busy || !tweak.trim()}>
              Send tweak
            </button>
          </p>
        </div>
      )}

      {post.status === 'saved' && (
        <p className="muted">Approved and saved. Publishing stays manual in Phase 1.</p>
      )}
    </div>
  )
}
