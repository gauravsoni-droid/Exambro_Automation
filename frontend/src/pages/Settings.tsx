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
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '1.5rem',
    }}
  >
    <div>
      <h2 style={{ margin: 0 }}>
        Content pillars
      </h2>

      <p
        className="muted"
        style={{
          marginTop: '0.4rem',
          marginBottom: 0,
        }}
      >
        Topic rotation pulls from 3 different active pillars each day.
      </p>
    </div>

    <span className="pill">
      Strategy
    </span>
  </div>

  {pillars.length > 0 && (
    <div
      style={{
        display: 'grid',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}
    >
      {pillars.map((p) => (
        <div
          key={p.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1rem',
            background: '#f8fafc',
          }}
        >
          <div
            className="spread"
            style={{
              margin: 0,
            }}
          >
            <div
              style={{
                flex: 1,
              }}
            >
              <input
                defaultValue={p.name}
                onBlur={(e) => {
                  if (
                    e.target.value.trim() &&
                    e.target.value !== p.name
                  ) {
                    updatePillar(p, {
                      name: e.target.value.trim(),
                    })
                  }
                }}
              />
            </div>

            <div className="row">
              {p.active ? (
                <span className="pill good">
                  active
                </span>
              ) : (
                <span className="pill bad">
                  disabled
                </span>
              )}

              <button
                className="ghost"
                onClick={() =>
                  updatePillar(p, {
                    active: !p.active,
                  })
                }
              >
                {p.active
                  ? 'Disable'
                  : 'Enable'}
              </button>

              <button
                className="danger"
                onClick={() =>
                  deletePillar(p.id)
                }
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )}

  <div
    style={{
      padding: '1rem',
      border: '1px dashed var(--border)',
      borderRadius: '12px',
      background: '#fafcff',
    }}
  >
    <form
      className="row"
      onSubmit={addPillar}
    >
      <input
        style={{ flex: 1 }}
        placeholder="New pillar name…"
        value={newPillar}
        onChange={(e) =>
          setNewPillar(e.target.value)
        }
      />

      <button
        type="submit"
        disabled={!newPillar.trim()}
      >
        Add
      </button>
    </form>
  </div>
</div>



  <div className="card">
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '1.5rem',
    }}
  >
    <div>
      <h2 style={{ margin: 0 }}>
        Business Foundation
      </h2>

      <p
        className="muted"
        style={{
          marginTop: '0.4rem',
          marginBottom: 0,
        }}
      >
        One-time setup that helps the AI understand your business, audience, and content boundaries.
      </p>
    </div>

    <span className="pill">
      Core Setup
    </span>
  </div>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: '1rem',
    }}
  >
    <div>
      <label>Who we serve</label>

      <input
        value={settings.bf_who_we_serve ?? ''}
        onChange={(e) =>
          patchLocal({
            bf_who_we_serve: e.target.value,
          })
        }
        placeholder="e.g. Class 11–12 + droppers preparing for JEE/NEET/CUET/GUJCET, and their teachers"
      />
    </div>

    <div>
      <label>Core values (plain words)</label>

      <input
        value={settings.bf_core_values ?? ''}
        onChange={(e) =>
          patchLocal({
            bf_core_values: e.target.value,
          })
        }
        placeholder="e.g. affordable, student-first, honest"
      />
    </div>
  </div>

  <div style={{ marginTop: '1rem' }}>
    <label>Topics we like</label>

    <input
      value={settings.bf_liked_topics ?? ''}
      onChange={(e) =>
        patchLocal({
          bf_liked_topics: e.target.value,
        })
      }
      placeholder="e.g. JEE preparation, NEET strategy, exam updates, study tips"
    />
  </div>

  <div
    style={{
      marginTop: '1.25rem',
      padding: '1rem',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      background: '#fef2f2',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.75rem',
      }}
    >
      <span
        style={{
          fontSize: '1rem',
        }}
      >
        🚫
      </span>

      <strong>Never Post Rules</strong>
    </div>

    <p
      className="muted"
      style={{
        marginTop: 0,
      }}
    >
      These are hard rejection rules. The AI Critic will automatically reject content that violates them.
    </p>

    <textarea
      value={lines(settings.bf_never_post)}
      onChange={(e) =>
        patchLocal({
          bf_never_post: parseLines(
            e.target.value
          ),
        })
      }
      placeholder={`e.g.
fake exam dates or unverified news
negative comments about competitors`}
      style={{
        minHeight: '140px',
      }}
    />
  </div>

  <div
    style={{
      marginTop: '1rem',
      padding: '1rem',
      background: '#f8fafc',
      border: '1px solid var(--border)',
      borderRadius: '12px',
    }}
  >
    <div
      style={{
        fontWeight: 600,
        marginBottom: '0.5rem',
      }}
    >
      AI Understanding Preview
    </div>

    <div className="muted">
      <strong>Audience:</strong>{' '}
      {settings.bf_who_we_serve ||
        'Not specified'}

      <br />
      <br />

      <strong>Values:</strong>{' '}
      {settings.bf_core_values ||
        'Not specified'}

      <br />
      <br />

      <strong>Preferred Topics:</strong>{' '}
      {settings.bf_liked_topics ||
        'Not specified'}

      <br />
      <br />

      <strong>Blocked Rules:</strong>{' '}
      {settings.bf_never_post.length}
    </div>
  </div>
</div>

<div className="card">
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '1.5rem',
    }}
  >
    <div>
      <h2 style={{ margin: 0 }}>
        Target Audience
      </h2>

      <p
        className="muted"
        style={{
          marginTop: '0.4rem',
          marginBottom: 0,
        }}
      >
        Optional audience targeting. Leave blank if you want the AI to work broadly.
      </p>
    </div>

    <span className="pill">
      Audience Profile
    </span>
  </div>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '1rem',
    }}
  >
    <div>
      <label>Country</label>
      <input
        value={settings.ta_country ?? ''}
        onChange={(e) =>
          patchLocal({
            ta_country: e.target.value,
          })
        }
        placeholder="e.g. India"
      />
    </div>

    <div>
      <label>State / region</label>
      <input
        value={settings.ta_state ?? ''}
        onChange={(e) =>
          patchLocal({
            ta_state: e.target.value,
          })
        }
        placeholder="e.g. Gujarat"
      />
    </div>

    <div>
      <label>City</label>
      <input
        value={settings.ta_city ?? ''}
        onChange={(e) =>
          patchLocal({
            ta_city: e.target.value,
          })
        }
        placeholder="e.g. Ahmedabad"
      />
    </div>

    <div>
      <label>Who they are</label>
      <input
        value={settings.ta_who ?? ''}
        onChange={(e) =>
          patchLocal({
            ta_who: e.target.value,
          })
        }
        placeholder="e.g. JEE & NEET aspirants"
      />
    </div>
  </div>

  <div
    style={{
      marginTop: '1.25rem',
      padding: '1rem',
      background: '#f8fafc',
      border: '1px solid var(--border)',
      borderRadius: '12px',
    }}
  >
    <div
      style={{
        fontWeight: 600,
        marginBottom: '0.5rem',
      }}
    >
      Audience Summary
    </div>

    <div className="muted">
      {[
        settings.ta_country,
        settings.ta_state,
        settings.ta_city,
      ]
        .filter(Boolean)
        .join(' • ') || 'Location not specified'}

      {settings.ta_who && (
        <>
          <br />
          {settings.ta_who}
        </>
      )}
    </div>
  </div>
</div>

 <div className="card">
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1rem',
    }}
  >
    <div>
      <h2 style={{ margin: 0 }}>
        Language & competitors
      </h2>

      <p
        className="muted"
        style={{
          marginTop: '0.35rem',
          marginBottom: 0,
        }}
      >
        Configure language rules and competitor tracking.
      </p>
    </div>

    <span className="pill">
      Content Strategy
    </span>
  </div>

  <div
    style={{
      display: 'grid',
      gap: '1rem',
    }}
  >
    <div
      style={{
        padding: '1rem',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        background: '#f8fafc',
      }}
    >
      <label
        style={{
          marginTop: 0,
          fontWeight: 600,
        }}
      >
        Keep-in-English allow-list
      </label>

      <p
        className="muted"
        style={{
          marginTop: '0.25rem',
        }}
      >
        One term per line. These words will stay in English during content generation.
      </p>

      <textarea
        value={lines(settings.english_allowlist)}
        onChange={(e) =>
          patchLocal({
            english_allowlist: parseLines(
              e.target.value
            ),
          })
        }
        placeholder={`JEE\nNEET\nCUET\nExamBro`}
      />
    </div>

    <div
      style={{
        padding: '1rem',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        background: '#f8fafc',
      }}
    >
      <label
        style={{
          marginTop: 0,
          fontWeight: 600,
        }}
      >
        Tracked competitor IG handles
      </label>

      <p
        className="muted"
        style={{
          marginTop: '0.25rem',
        }}
      >
        One Instagram handle per line. Used for competitor monitoring in Phase 2.
      </p>

      <textarea
        value={lines(settings.competitor_handles)}
        onChange={(e) =>
          patchLocal({
            competitor_handles: parseLines(
              e.target.value
            ),
          })
        }
        placeholder={`@competitor1\n@competitor2\n@competitor3`}
      />
    </div>
  </div>
</div>
    </div>
  )
}
