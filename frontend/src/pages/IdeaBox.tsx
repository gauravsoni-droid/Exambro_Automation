import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { Idea, IdeaType } from '../types'

export default function IdeaBox() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [type, setType] = useState<IdeaType>('text')
  const [payload, setPayload] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setIdeas(await api.get<Idea[]>('/ideas'))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load ideas')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !payload.trim()) return
    setBusy(true)
    setError('')
    try {
      await api.post('/ideas', { type, payload: payload.trim() })
      setPayload('')
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

  return (
    <div>
      <h1>Idea box</h1>
      <p className="muted">
        A pending idea takes slot 1 in the next topic round — AI shapes it, you still approve.
      </p>
      <form className="card" onSubmit={add}>
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as IdeaType)}>
          <option value="text">Text</option>
          <option value="link">Link</option>
          <option value="image">Image (paste URL)</option>
        </select>
        <label>{type === 'text' ? 'Your idea' : 'URL'}</label>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder={type === 'text' ? 'Post idea…' : 'https://…'}
        />
        {error && <p className="error">{error}</p>}
        <p>
          <button type="submit" disabled={busy || !payload.trim()}>
            Drop idea
          </button>
        </p>
      </form>

      {ideas.map((i) => (
        <div key={i.id} className="card spread">
          <div>
            <span className="pill">{i.type}</span>
            <span className={`pill ${i.status === 'used' ? 'good' : i.status === 'discarded' ? 'bad' : ''}`}>
              {i.status}
            </span>
            <p className="caption">{i.payload}</p>
          </div>
          {i.status === 'pending' && (
            <button className="ghost" onClick={() => discard(i.id)}>
              Discard
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
