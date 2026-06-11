import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import type { Topic } from '../types'

export default function Today() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

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

  useEffect(() => {
    load()
  }, [load])

  async function pick(id: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/topics/${id}/pick`)
      navigate('/review')
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
      // Runs news search + topic generation — takes up to a minute
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

  if (loading) return <p className="muted">Loading topics…</p>

  return (
    <div>
      <div className="spread">
        <h1>Today's topics</h1>
        {topics.length > 0 && (
          <button className="ghost" onClick={rejectAll} disabled={busy}>
            Reject all → regenerate
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      {topics.length === 0 && (
        <div className="card">
          <p className="muted">
            No topics waiting. The next round runs at 09:00 IST (or a post is in flight).
          </p>
          <button onClick={generateNow} disabled={generating}>
            {generating ? 'Generating… (news search + topics, up to a minute)' : 'Generate topics now'}
          </button>
        </div>
      )}
      {topics.map((t) => (
        <div key={t.id} className="card clickable" onClick={() => pick(t.id)}>
          <div>
            {t.pillar_name && <span className="pill">{t.pillar_name}</span>}
            {t.is_rotation_exception && <span className="pill exception">urgent news</span>}
            {t.from_idea_id && <span className="pill good">your idea</span>}
          </div>
          <h2>{t.title}</h2>
          <p className="muted">{t.description}</p>
          <button disabled={busy}>Pick this topic</button>
        </div>
      ))}
    </div>
  )
}
