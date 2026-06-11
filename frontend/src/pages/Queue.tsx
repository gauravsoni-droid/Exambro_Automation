import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import type { QueueItem, QueueStats } from '../types'

export default function Queue() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.get<QueueItem[]>('/queue'), api.get<QueueStats>('/queue/stats')])
      .then(([q, s]) => {
        setItems(q)
        setStats(s)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load queue'))
  }, [])

  return (
    <div>
      <h1>Queue / History</h1>
      {error && <p className="error">{error}</p>}

      {stats && (
        <div className="statgrid">
          <div className="stat">
            <div className="num">{Math.round(stats.approve_no_edit_rate * 100)}%</div>
            <div className="muted">approved without edits (goal ~90%)</div>
          </div>
          <div className="stat">
            <div className="num">{Math.round(stats.edit_rate * 100)}%</div>
            <div className="muted">edit rate (tweaks)</div>
          </div>
          <div className="stat">
            <div className="num">{stats.tap2_total}</div>
            <div className="muted">posts reviewed</div>
          </div>
        </div>
      )}

      {stats && Object.keys(stats.pillar_balance).length > 0 && (
        <div className="card">
          <h2>Pillar balance (picked topics)</h2>
          {Object.entries(stats.pillar_balance).map(([name, count]) => (
            <p key={name} className="spread">
              <span>{name}</span>
              <span className="pill">{count}</span>
            </p>
          ))}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Topic</th>
            <th>Pillar</th>
            <th>Format</th>
            <th>Status</th>
            <th>Critic</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.topics?.round_date ?? '—'}</td>
              <td>
                <Link to={`/review/${p.id}`}>{p.topics?.title ?? p.id.slice(0, 8)}</Link>
              </td>
              <td>{p.topics?.pillars?.name ?? '—'}</td>
              <td>{p.format ?? '—'}</td>
              <td>
                <span className={`pill ${p.status === 'saved' ? 'good' : p.status === 'rejected' ? 'bad' : ''}`}>
                  {p.status}
                </span>
              </td>
              <td>{p.critic_score ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="muted">No posts yet.</p>}
    </div>
  )
}
