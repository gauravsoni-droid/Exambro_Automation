'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { AppSettings, Cadence, Pillar } from '../types'
import Button from '../components/Button'
import { Input } from '../components/Input'
import Toggle from '../components/Toggle'
import SegControl from '../components/SegControl'

const CADENCE_OPTIONS = [
  { label: 'Daily',      value: 'daily' },
  { label: 'Every 2 d', value: 'every_2_days' },
]

const PILLAR_COLORS = ['#2b6cb0', '#f5a623', '#2e9b6b', '#6b53c4', '#c2415c', '#e67333', '#1c5f94']

type RulesTab = 'voice' | 'never'

// ── Layout helpers ────────────────────────────────────────────

function Section({ title, right, children }: {
  title: string; right?: ReactNode; children: ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-[8px] gap-3">
        <h2 className="text-[10.5px] font-bold uppercase tracking-[.12em] text-muted m-0 flex-shrink-0">
          {title}
        </h2>
        {right}
      </div>
      <div className="bg-white border border-border rounded-[13px] overflow-hidden shadow-card-sm">
        {children}
      </div>
    </div>
  )
}

// Label-left / content-right row — no input border, card provides the frame
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 border-b border-border last:border-b-0">
      <span className="w-[100px] flex-shrink-0 text-[11.5px] font-semibold text-muted py-[11px] leading-none">
        {label}
      </span>
      <div className="flex-1 min-w-0 py-[2px]">{children}</div>
    </div>
  )
}

// Bare input — no border, sits inside a Row
function BareInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-transparent border-0 outline-none text-[13px] font-medium text-text placeholder:text-[#bbb] py-[9px] focus:ring-0"
    />
  )
}

// ── Main component ────────────────────────────────────────────

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [pillars, setPillars]   = useState<Pillar[]>([])
  const [newPillar, setNewPillar]       = useState('')
  const [addingPillar, setAddingPillar] = useState(false)
  const [newRule, setNewRule] = useState('')
  const [newTerm, setNewTerm] = useState('')
  const [rulesTab, setRulesTab] = useState<RulesTab>('voice')
  const [error, setError]   = useState('')
  const [saved, setSaved]   = useState(false)
  const [busy, setBusy]     = useState(false)

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

  useEffect(() => { load() }, [load])

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

  async function addPillar(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!newPillar.trim()) return
    try {
      await api.post('/pillars', { name: newPillar.trim(), sort_order: pillars.length + 1 })
      setNewPillar('')
      setAddingPillar(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Add pillar failed')
    }
  }

  async function updatePillar(p: Pillar, changes: Partial<Pillar>) {
    try {
      await api.patch(`/pillars/${p.id}`, {
        name: p.name, description: p.description,
        active: p.active, sort_order: p.sort_order, ...changes,
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed')
    }
  }

  async function deletePillar(id: string) {
    try {
      await api.delete(`/pillars/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed')
    }
  }

  function addRule() {
    if (!newRule.trim() || !settings) return
    patchLocal({ bf_never_post: [...settings.bf_never_post, newRule.trim()] })
    setNewRule('')
  }

  function removeRule(idx: number) {
    if (!settings) return
    patchLocal({ bf_never_post: settings.bf_never_post.filter((_, i) => i !== idx) })
  }

  function addTerm() {
    if (!newTerm.trim() || !settings) return
    if (settings.english_allowlist.includes(newTerm.trim())) { setNewTerm(''); return }
    patchLocal({ english_allowlist: [...settings.english_allowlist, newTerm.trim()] })
    setNewTerm('')
  }

  function removeTerm(term: string) {
    if (!settings) return
    patchLocal({ english_allowlist: settings.english_allowlist.filter((t) => t !== term) })
  }

  // ── Loading ─────────────────────────────────────────────────
  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-[54px] h-[54px] rounded-full border-4 border-[#ece5db] border-t-orange animate-spin mb-5" />
        <p className="text-[13px] font-medium text-muted">{error || 'Loading…'}</p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Sticky save header ──────────────────────────────── */}
      <div className="sticky top-[52px] md:top-0 z-20 bg-bg/95 backdrop-blur-sm -mx-4 px-4 pt-3 pb-3 mb-5 md:-mx-10 md:px-10 border-b border-border">
        <div className="flex items-center justify-between gap-3 max-w-[560px] md:max-w-none mx-auto md:mx-0">
          <h1 className="text-[18px] font-extrabold text-text leading-tight m-0 tracking-tight">Settings</h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saved && <span className="text-[11.5px] font-bold text-good">✓ Saved</span>}
            <Button size="small" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>

      {error && <p className="text-bad text-[0.88rem] mb-4">{error}</p>}

      {/* ── Brand ───────────────────────────────────────────── */}
      <Section title="Brand">
        <Row label="Who we serve">
          <BareInput
            value={settings.bf_who_we_serve ?? ''}
            onChange={(e) => patchLocal({ bf_who_we_serve: e.target.value })}
            placeholder="JEE / NEET students and teachers"
          />
        </Row>
        <Row label="Core values">
          <BareInput
            value={settings.bf_core_values ?? ''}
            onChange={(e) => patchLocal({ bf_core_values: e.target.value })}
            placeholder="affordable, student-first, honest"
          />
        </Row>
        <Row label="Liked topics">
          <BareInput
            value={settings.bf_liked_topics ?? ''}
            onChange={(e) => patchLocal({ bf_liked_topics: e.target.value })}
            placeholder="Exam news, PYQ solving, revision strategy"
          />
        </Row>
      </Section>

      {/* ── Audience ────────────────────────────────────────── */}
      <Section title="Audience">
        <Row label="Country / State">
          <div className="flex items-center gap-1">
            <BareInput
              value={settings.ta_country ?? ''}
              onChange={(e) => patchLocal({ ta_country: e.target.value })}
              placeholder="India"
              className="w-[90px] flex-shrink-0"
            />
            <span className="text-muted text-[12px]">/</span>
            <BareInput
              value={settings.ta_state ?? ''}
              onChange={(e) => patchLocal({ ta_state: e.target.value })}
              placeholder="Gujarat"
            />
          </div>
        </Row>
        <Row label="City">
          <BareInput
            value={settings.ta_city ?? ''}
            onChange={(e) => patchLocal({ ta_city: e.target.value })}
            placeholder="Optional"
          />
        </Row>
        <Row label="Who they are">
          <BareInput
            value={settings.ta_who ?? ''}
            onChange={(e) => patchLocal({ ta_who: e.target.value })}
            placeholder="Class 12 students preparing for exams"
          />
        </Row>
      </Section>

      {/* ── Content Pillars ─────────────────────────────────── */}
      <Section
        title="Content Pillars"
        right={
          <SegControl
            options={CADENCE_OPTIONS}
            value={settings.cadence}
            onChange={(v) => patchLocal({ cadence: v as Cadence })}
          />
        }
      >
        {pillars.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-[10px] border-b border-border last:border-b-0">
            <span
              className="w-[8px] h-[8px] rounded-[2px] flex-shrink-0"
              style={{ background: PILLAR_COLORS[i % PILLAR_COLORS.length] }}
            />
            <span className="flex-1 text-[13px] font-semibold text-text min-w-0 truncate">{p.name}</span>
            <Toggle on={p.active} onChange={() => updatePillar(p, { active: !p.active })} />
            <button
              onClick={() => deletePillar(p.id)}
              className="text-muted hover:text-bad text-[16px] font-bold border-0 bg-transparent cursor-pointer leading-none flex-shrink-0 w-5 text-center"
              aria-label="Delete"
            >×</button>
          </div>
        ))}

        {addingPillar ? (
          <form
            onSubmit={addPillar}
            className="flex gap-2 items-center px-4 py-[10px] border-t border-border"
          >
            <Input
              className="flex-1 py-[7px] text-[13px]"
              placeholder="Pillar name…"
              value={newPillar}
              onChange={(e) => setNewPillar(e.target.value)}
              autoFocus
            />
            <Button type="submit" size="small" disabled={!newPillar.trim()}>Add</Button>
            <button
              type="button"
              onClick={() => { setAddingPillar(false); setNewPillar('') }}
              className="text-[12px] font-semibold text-muted border-0 bg-transparent cursor-pointer"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingPillar(true)}
            className="w-full px-4 py-[10px] text-[12.5px] font-semibold text-muted text-left border-0 bg-transparent cursor-pointer hover:text-orange-600 transition-colors flex items-center gap-2 border-t border-border"
          >
            + Add pillar
          </button>
        )}
      </Section>

      {/* ── Rules ───────────────────────────────────────────── */}
      <Section
        title="Rules"
        right={
          <div className="flex bg-bg border border-border rounded-[9px] p-[2px] gap-[2px]">
            {(['voice', 'never'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRulesTab(tab)}
                className={[
                  'border-0 rounded-[7px] px-3 py-[5px] text-[11px] font-bold cursor-pointer transition-all duration-100 leading-none',
                  rulesTab === tab
                    ? 'bg-white text-text shadow-sm'
                    : 'bg-transparent text-muted hover:text-text',
                ].join(' ')}
              >
                {tab === 'voice' ? 'Voice' : 'Never Post'}
              </button>
            ))}
          </div>
        }
      >
        <div className="px-4 py-3">
          {/* Voice tab */}
          {rulesTab === 'voice' && (
            <>
              <p className="text-[11px] text-muted mb-3 m-0">Terms that stay in English during Hindi content generation.</p>
              <div className="flex flex-wrap gap-[6px] mb-3">
                {settings.english_allowlist.length === 0 ? (
                  <span className="text-[12px] text-muted italic">None yet</span>
                ) : (
                  settings.english_allowlist.map((term) => (
                    <span
                      key={term}
                      className="inline-flex items-center gap-[4px] text-[12px] font-semibold text-accent-700 bg-[#eaf1fa] px-[8px] py-[4px] rounded-[7px]"
                    >
                      {term}
                      <button
                        onClick={() => removeTerm(term)}
                        className="text-muted hover:text-bad border-0 bg-transparent cursor-pointer p-0 font-bold text-[12px] leading-none"
                        aria-label={`Remove ${term}`}
                      >×</button>
                    </span>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  className="flex-1 py-[7px] text-[13px] bg-cream"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTerm())}
                  placeholder="e.g. JEE, NEET, ExamBro"
                />
                <button
                  onClick={addTerm}
                  disabled={!newTerm.trim()}
                  className="bg-text text-white rounded-[9px] px-3 py-[7px] text-[12px] font-bold border-0 cursor-pointer hover:bg-navy disabled:opacity-40 transition-colors flex-shrink-0"
                >Add</button>
              </div>
            </>
          )}

          {/* Never Post tab */}
          {rulesTab === 'never' && (
            <>
              <p className="text-[11px] text-muted mb-3 m-0">Posts that break any rule here are rejected by the Critic automatically.</p>
              <div className="flex flex-col gap-[6px] mb-3">
                {settings.bf_never_post.length === 0 ? (
                  <span className="text-[12px] text-muted italic">No rules yet</span>
                ) : (
                  settings.bf_never_post.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 bg-[#fef8f8] border border-[#f3d4da] rounded-[9px] px-3 py-[8px]"
                    >
                      <span className="flex-1 text-[12.5px] font-medium text-[#a3324b] leading-snug">{rule}</span>
                      <button
                        onClick={() => removeRule(idx)}
                        className="text-[#c2415c] hover:text-bad font-bold text-[14px] border-0 bg-transparent cursor-pointer leading-none flex-shrink-0"
                        aria-label="Remove rule"
                      >×</button>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  className="flex-1 py-[7px] text-[13px] bg-cream"
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRule())}
                  placeholder="e.g. Never guarantee a rank or score"
                />
                <button
                  onClick={addRule}
                  disabled={!newRule.trim()}
                  className="bg-[#c2415c] text-white rounded-[9px] px-3 py-[7px] text-[12px] font-bold border-0 cursor-pointer hover:brightness-95 disabled:opacity-40 transition-all flex-shrink-0"
                >Add</button>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* bottom padding */}
      <div className="pb-8" />

      {/* DEV ONLY — remove before production */}
      <div className="border border-dashed border-red-300 rounded-xl p-4 mb-8">
        <p className="text-[11px] font-bold uppercase tracking-widest text-red-400 mb-3">Dev tools</p>
        <Button
          onClick={async () => {
            const res = await api.post('/calibration/promote')
            console.log('[promote]', res)
          }}
          size="small"
        >
          Test Calibration Promotion
        </Button>
      </div>
      {/* END DEV ONLY */}
    </div>
  )
}
