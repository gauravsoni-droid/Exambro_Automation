// Phase-0 throwaway screen — Critic Accuracy Test (Appflow §5).
// Blind protocol: owner verdict saved FIRST; critic verdict revealed only after save.
// Retires after the ≥80% gate passes.

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { CalibrationItem, CalibrationSummary, Verdict } from '../types'

export default function Calibration() {
  const [item, setItem] = useState<CalibrationItem | null>(null)
  const [revealed, setRevealed] = useState<CalibrationItem | null>(null)
  const [summary, setSummary] = useState<CalibrationSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [seedText, setSeedText] = useState('')

  const load = useCallback(async () => {
    try {
      const [next, sum] = await Promise.all([
        api.get<CalibrationItem | null>('/calibration/next'),
        api.get<CalibrationSummary>('/calibration/summary'),
      ])
      setItem(next)
      setSummary(sum)
      setRevealed(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addPost() {
    if (busy || !seedText.trim()) return
    setBusy(true)
    setError('')
    try {
      await api.post('/calibration/seed', { contents: [seedText.trim()] })
      setSeedText('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Add failed')
    } finally {
      setBusy(false)
    }
  }

  async function label(verdict: Verdict) {
    if (!item || busy) return
    setBusy(true)
    setError('')
    try {
      // Owner verdict saved first; the response reveals the critic's verdict.
      setRevealed(await api.post<CalibrationItem>(`/calibration/${item.id}/label`, { verdict }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Label failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Critic Accuracy Test (Phase 0)</h1>
      {summary && (
        <div className="statgrid">
          <div className="stat">
            <div className="num">
              {summary.labeled}/{summary.total}
            </div>
            <div className="muted">labeled</div>
          </div>
          <div className="stat">
            <div className="num">{summary.agreed}</div>
            <div className="muted">agreements</div>
          </div>
          <div className="stat">
            <div className="num">{summary.pass_gate ? 'PASS' : '—'}</div>
            <div className="muted">gate: ≥40/50 (80%)</div>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {revealed ? (
        <div className="card">
          <h2>Result</h2>
          <p>
            Your verdict: <span className="pill">{revealed.owner_verdict}</span>
            Critic verdict: <span className="pill">{revealed.critic_verdict}</span>
            {revealed.critic_score != null && (
              <span className="pill">score {revealed.critic_score}/10</span>
            )}
          </p>
          <p>
            {revealed.agreed ? (
              <span className="pill good">agreed</span>
            ) : (
              <span className="pill bad">disagreed</span>
            )}
          </p>
          <button onClick={load}>Next post →</button>
        </div>
      ) : item ? (
        <div className="card">
          <h2>Rate this post — good, or needs work?</h2>
          <p className="caption">{item.content}</p>
          <p className="muted">
            Judge blind: the AI's verdict is revealed only after you save yours.
          </p>
          <div className="row">
            <button className="success" onClick={() => label('good')} disabled={busy}>
              Good
            </button>
            <button className="danger" onClick={() => label('needs_work')} disabled={busy}>
              Needs work
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">No posts waiting for a verdict. Add sample posts below.</p>
      )}

      <div className="card">
        <h2>Add a sample post</h2>
        <p className="muted">
          Paste one post caption at a time (text only — the critic judges writing, not
          images). Target: 50 total, a mix of good and weak (real past posts + AI drafts).
        </p>
        <textarea
          style={{ minHeight: 160 }}
          value={seedText}
          onChange={(e) => setSeedText(e.target.value)}
          placeholder="Post का caption यहाँ paste करें…"
        />
        <p className="row">
          <button onClick={addPost} disabled={busy || !seedText.trim()}>
            {busy ? 'Adding…' : 'Add post'}
          </button>
          <span className="muted">{summary?.total ?? 0} of 50 in the test set</span>
        </p>
      </div>
    </div>
  )
}
