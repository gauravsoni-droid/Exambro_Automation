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
const pending = ideas.filter((i) => i.status === 'pending').length
const used = ideas.filter((i) => i.status === 'used').length
const discarded = ideas.filter((i) => i.status === 'discarded').length

return (
  <div>
    <div className="card">
      <h1>Idea box</h1>

      <p className="muted">
        A pending idea takes slot 1 in the next topic round — AI shapes it, you still approve.
      </p>

      <div className="statgrid" style={{ marginTop: '1rem' }}>
        <div className="stat">
          <div className="num">{pending}</div>
          <div className="muted">pending</div>
        </div>

        <div className="stat">
          <div className="num">{used}</div>
          <div className="muted">used</div>
        </div>

        <div className="stat">
          <div className="num">{discarded}</div>
          <div className="muted">discarded</div>
        </div>
      </div>
    </div>

    <form
      className="card"
      onSubmit={add}
      style={{
        padding: '1.5rem',
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        Drop a new idea
      </h2>

      <label>Type</label>

  <select
  value={type}
  onChange={(e) => setType(e.target.value as IdeaType)}
>
  <option value="text">📝 Text</option>
  <option value="link">🔗 Link</option>
  <option value="image">🖼️ Image (paste URL)</option>
</select>

      <label>
        {type === 'text'
          ? 'Your idea'
          : 'URL'}
      </label>

      <textarea
        value={payload}
        onChange={(e) =>
          setPayload(e.target.value)
        }
        placeholder={
          type === 'text'
            ? 'Post idea…'
            : 'https://…'
        }
        style={{
          minHeight: '140px',
        }}
      />

      {error && (
        <p className="error">
          {error}
        </p>
      )}

      <div
        style={{
          marginTop: '1rem',
        }}
      >
        <button
          type="submit"
          disabled={
            busy || !payload.trim()
          }
        >
          Drop idea
        </button>
      </div>
    </form>

    {ideas.length === 0 ? (
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <p className="muted">
          No ideas yet.
        </p>
      </div>
    ) : (
      <>
        {ideas.map((i) => (
          <div
            key={i.id}
            className="card"
            style={{
              marginBottom: '12px',
            }}
          >
            <div
              className="row"
              style={{
                marginBottom: '12px',
              }}
            >
              <span className="pill">
                {i.type}
              </span>

              <span
                className={`pill ${
                  i.status === 'used'
                    ? 'good'
                    : i.status ===
                      'discarded'
                    ? 'bad'
                    : ''
                }`}
              >
                {i.status}
              </span>
            </div>

            <p
              className="caption"
              style={{
                marginBottom: '1rem',
              }}
            >
              {i.payload}
            </p>

            {i.status ===
              'pending' && (
              <button
                className="ghost"
                onClick={() =>
                  discard(i.id)
                }
              >
                Discard
              </button>
            )}
          </div>
        ))}
      </>
    )}
  </div>
)


}
