import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { AppSettings, Cadence, Pillar } from '../types'

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [pillars, setPillars] = useState<Pillar[]>([])
  const [newPillar, setNewPillar] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api.get<AppSettings>('/settings'),
        api.get<Pillar[]>('/pillars'),
      ])
      setSettings(s)
      setPillars(p)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load settings')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function patchLocal(changes: Partial<AppSettings>) {
    setSettings((s) => (s ? { ...s, ...changes } : s))
    setSaved(false)
  }

  async function save() {
    if (!settings || busy) return
    setBusy(true)
    setError('')
    try {
      const { id: _id, ...body } = settings
      await api.patch('/settings', body)
      setSaved(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function addPillar(e: React.FormEvent) {
    e.preventDefault()
    if (!newPillar.trim()) return
    try {
      await api.post('/pillars', {
        name: newPillar.trim(),
        sort_order: pillars.length + 1,
      })
      setNewPillar('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Add pillar failed')
    }
  }

  async function updatePillar(p: Pillar, changes: Partial<Pillar>) {
    try {
      await api.patch(`/pillars/${p.id}`, {
        name: p.name,
        description: p.description,
        active: p.active,
        sort_order: p.sort_order,
        ...changes,
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update pillar failed')
    }
  }

  async function deletePillar(id: string) {
    try {
      await api.delete(`/pillars/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed — disable it instead?')
    }
  }

  if (!settings) return <p className="muted">{error || 'Loading…'}</p>

  const lines = (arr: string[]) => arr.join('\n')
  const parseLines = (v: string) =>
    v.split('\n').map((x) => x.trim()).filter(Boolean)

  return (
    <div>
      <div className="spread">
        <h1>Settings</h1>
        <div className="row">
          {saved && <span className="pill good">saved</span>}
          <button onClick={save} disabled={busy}>
            Save settings
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h2>Cadence</h2>
        <select
          value={settings.cadence}
          onChange={(e) => patchLocal({ cadence: e.target.value as Cadence })}
        >
          <option value="daily">1 post per day (default)</option>
          <option value="every_2_days">1 post every 2 days</option>
        </select>
      </div>

      <div className="card">
        <h2>Content pillars</h2>
        <p className="muted">Topic rotation pulls from 3 different active pillars each day.</p>
        {pillars.map((p) => (
          <div key={p.id} className="row" style={{ marginBottom: '0.5rem' }}>
            <input
              style={{ flex: 1 }}
              defaultValue={p.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== p.name)
                  updatePillar(p, { name: e.target.value.trim() })
              }}
            />
            <button className="ghost" onClick={() => updatePillar(p, { active: !p.active })}>
              {p.active ? 'Disable' : 'Enable'}
            </button>
            <button className="danger" onClick={() => deletePillar(p.id)}>
              Delete
            </button>
            {!p.active && <span className="pill bad">disabled</span>}
          </div>
        ))}
        <form className="row" onSubmit={addPillar}>
          <input
            style={{ flex: 1 }}
            placeholder="New pillar name…"
            value={newPillar}
            onChange={(e) => setNewPillar(e.target.value)}
          />
          <button type="submit" disabled={!newPillar.trim()}>
            Add
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Business Foundation (one-time)</h2>
        <label>Who we serve</label>
        <input
          value={settings.bf_who_we_serve ?? ''}
          onChange={(e) => patchLocal({ bf_who_we_serve: e.target.value })}
          placeholder="e.g. Class 11–12 + droppers preparing for JEE/NEET/CUET/GUJCET, and their teachers"
        />
        <label>Core values (plain words)</label>
        <input
          value={settings.bf_core_values ?? ''}
          onChange={(e) => patchLocal({ bf_core_values: e.target.value })}
          placeholder="e.g. affordable, student-first, honest"
        />
        <label>Topics we like</label>
        <input
          value={settings.bf_liked_topics ?? ''}
          onChange={(e) => patchLocal({ bf_liked_topics: e.target.value })}
        />
        <label>Never post (one rule per line — hard critic reject rules)</label>
        <textarea
          value={lines(settings.bf_never_post)}
          onChange={(e) => patchLocal({ bf_never_post: parseLines(e.target.value) })}
          placeholder={'e.g.\nfake exam dates or unverified news\nnegative comments about competitors'}
        />
      </div>

      <div className="card">
        <h2>Target Audience (optional — works if empty)</h2>
        <label>Country</label>
        <input
          value={settings.ta_country ?? ''}
          onChange={(e) => patchLocal({ ta_country: e.target.value })}
        />
        <label>State / region</label>
        <input
          value={settings.ta_state ?? ''}
          onChange={(e) => patchLocal({ ta_state: e.target.value })}
        />
        <label>City</label>
        <input
          value={settings.ta_city ?? ''}
          onChange={(e) => patchLocal({ ta_city: e.target.value })}
        />
        <label>Who they are</label>
        <input
          value={settings.ta_who ?? ''}
          onChange={(e) => patchLocal({ ta_who: e.target.value })}
        />
      </div>

      <div className="card">
        <h2>Language & competitors</h2>
        <label>Keep-in-English allow-list (one per line)</label>
        <textarea
          value={lines(settings.english_allowlist)}
          onChange={(e) => patchLocal({ english_allowlist: parseLines(e.target.value) })}
        />
        <label>Tracked competitor IG handles (one per line — Phase 2)</label>
        <textarea
          value={lines(settings.competitor_handles)}
          onChange={(e) => patchLocal({ competitor_handles: parseLines(e.target.value) })}
        />
      </div>
    </div>
  )
}
