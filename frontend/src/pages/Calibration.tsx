'use client'

// Phase-0 throwaway screen — Critic Accuracy Test (Appflow §5).
// Blind protocol: owner verdict saved FIRST; critic verdict revealed only after save.
// Retires after the ≥80% gate passes.

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { CalibrationItem, CalibrationSummary, Verdict } from '../types'
import Button from '../components/Button'
import Card from '../components/Card'
import Badge from '../components/Badge'
import { Textarea } from '../components/Input'

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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-[0.9rem] mb-4">
          <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
            <div className="text-[1.8rem] font-bold text-accent-700 mb-1">
              {summary.labeled}/{summary.total}
            </div>
            <div className="text-muted text-[0.88rem]">labeled</div>
          </div>
          <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
            <div className="text-[1.8rem] font-bold text-accent-700 mb-1">{summary.agreed}</div>
            <div className="text-muted text-[0.88rem]">agreements</div>
          </div>
          <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
            <div className="text-[1.8rem] font-bold text-accent-700 mb-1">{summary.pass_gate ? 'PASS' : '—'}</div>
            <div className="text-muted text-[0.88rem]">gate: ≥40/50 (80%)</div>
          </div>
        </div>
      )}
      {error && <p className="text-bad my-2">{error}</p>}

      {revealed ? (
        <Card>
          <h2>Result</h2>
          <p>
            Your verdict: <Badge>{revealed.owner_verdict}</Badge>
            Critic verdict: <Badge>{revealed.critic_verdict}</Badge>
            {revealed.critic_score != null && (
              <Badge>score {revealed.critic_score}/10</Badge>
            )}
          </p>
          <p>
            {revealed.agreed ? (
              <Badge variant="good">agreed</Badge>
            ) : (
              <Badge variant="bad">disagreed</Badge>
            )}
          </p>
          <Button onClick={load}>Next post →</Button>
        </Card>
      ) : item ? (
        <Card>
          <h2>Rate this post — good, or needs work?</h2>
          <p className="whitespace-pre-wrap leading-[1.6] text-text-2">{item.content}</p>
          <p className="text-muted text-[0.88rem]">
            Judge blind: the AI's verdict is revealed only after you save yours.
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <Button variant="success" onClick={() => label('good')} disabled={busy}>
              Good
            </Button>
            <Button variant="danger" onClick={() => label('needs_work')} disabled={busy}>
              Needs work
            </Button>
          </div>
        </Card>
      ) : (
        <p className="text-muted text-[0.88rem]">No posts waiting for a verdict. Add sample posts below.</p>
      )}

      <Card>
        <h2>Add a sample post</h2>
        <p className="text-muted text-[0.88rem]">
          Paste one post caption at a time (text only — the critic judges writing, not
          images). Target: 50 total, a mix of good and weak (real past posts + AI drafts).
        </p>
        <Textarea
          className="min-h-[160px]"
          value={seedText}
          onChange={(e) => setSeedText(e.target.value)}
          placeholder="Post का caption यहाँ paste करें…"
        />
        <p className="flex gap-3 items-center flex-wrap">
          <Button onClick={addPost} disabled={busy || !seedText.trim()}>
            {busy ? 'Adding…' : 'Add post'}
          </Button>
          <span className="text-muted text-[0.88rem]">{summary?.total ?? 0} of 50 in the test set</span>
        </p>
      </Card>
    </div>
  )
}
