'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { AppSettings, Cadence, Pillar } from '../types'
import Button from '../components/Button'
import { Input, Textarea } from '../components/Input'
import SetSection from '../components/SetSection'
import Toggle from '../components/Toggle'
import SegControl from '../components/SegControl'

const CADENCE_OPTIONS = [
  { label: 'Every day', value: 'daily' },
  { label: 'Every 2 days', value: 'every_2_days' },
]

// Prototype-exact pillar dot colours
const PILLAR_COLORS = ['#2b6cb0', '#f5a623', '#2e9b6b', '#6b53c4', '#c2415c', '#e67333', '#1c5f94']

// Shared row divider: matches prototype .set-row / .field / .pill-edit
const DIV = 'border-t border-[#ece5db]'

// Ghost dashed button — matches prototype .ghostbtn exactly
function GhostBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border-[1.5px] border-dashed border-[#e2dace] bg-transparent rounded-[14px] px-4 py-[13px] mt-[12px] mb-[6px] text-[13px] font-semibold text-muted cursor-pointer flex items-center justify-center gap-2 transition-all duration-150 hover:border-orange hover:text-orange-600 hover:bg-white"
    >
      {children}
    </button>
  )
}

// Editable field row — matches prototype .field style
function Field({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: ReactNode
}) {
  return (
    <div className={`py-[11px] ${DIV}`}>
      <label className="block text-[12px] font-bold text-navy mb-[7px]">
        {label}
        {note && <em className="not-italic font-semibold text-muted text-[11px] ml-1">{note}</em>}
      </label>
      {children}
    </div>
  )
}

// Toggle row — matches prototype .set-row
function SetRow({
  label,
  sublabel,
  first,
  children,
}: {
  label: string
  sublabel?: string
  first?: boolean
  children: ReactNode
}) {
  return (
    <div className={`flex items-center justify-between py-[12px] gap-4 ${first ? '' : DIV}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-navy m-0 leading-snug">{label}</p>
        {sublabel && (
          <p className="text-[11.5px] font-medium text-muted m-0 mt-[2px] leading-snug">{sublabel}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

const lines = (arr: string[]) => arr.join('\n')
const parseLines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean)

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [pillars, setPillars] = useState<Pillar[]>([])
  const [newPillar, setNewPillar] = useState('')
  const [addingPillar, setAddingPillar] = useState(false)
  const [newHandle, setNewHandle] = useState('')
  const [addingHandle, setAddingHandle] = useState(false)
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
        name: p.name, description: p.description, active: p.active, sort_order: p.sort_order, ...changes,
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
      setError(err instanceof ApiError ? err.message : 'Delete failed — disable it instead?')
    }
  }

  function addHandle() {
    if (!newHandle.trim() || !settings) return
    const h = newHandle.trim().startsWith('@') ? newHandle.trim() : `@${newHandle.trim()}`
    patchLocal({ competitor_handles: [...settings.competitor_handles, h] })
    setNewHandle('')
    setAddingHandle(false)
  }

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-navy leading-tight tracking-tight m-0 mb-1">Settings</h1>
          <p className="text-[12.5px] font-medium text-muted m-0">
            Set this once. The daily flow runs on it — you won't come back here often.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-[11px] font-bold text-good bg-good-bg px-3 py-[6px] rounded-[8px]">✓ Saved</span>
          )}
          <Button size="small" onClick={save} disabled={busy}>Save settings</Button>
        </div>
      </div>

      {error && <p className="text-bad text-[0.88rem] mb-3">{error}</p>}

      {/* ── 1. Posting rhythm ───────────────────────────────── */}
      <SetSection icon="🗓" title="Posting rhythm" subtitle="How often you get a topic to approve">
        <div className="pt-[4px] pb-[14px]">
          <SegControl
            options={CADENCE_OPTIONS}
            value={settings.cadence}
            onChange={(v) => patchLocal({ cadence: v as Cadence })}
          />
        </div>
      </SetSection>

      {/* ── 2. Content pillars ──────────────────────────────── */}
      <SetSection icon="🧱" title="Content pillars" subtitle="Your themes — the flow rotates through these">
        {pillars.map((p, i) => (
          <div key={p.id} className={`flex items-center gap-[10px] py-[11px] ${DIV}`}>
            <span className="text-muted text-[18px] leading-none cursor-grab select-none">⠿</span>
            <span
              className="w-[9px] h-[9px] rounded-[3px] flex-shrink-0"
              style={{ background: PILLAR_COLORS[i % PILLAR_COLORS.length] }}
            />
            <span className="flex-1 text-[13.5px] font-semibold text-navy min-w-0 truncate">{p.name}</span>
            <Toggle on={p.active} onChange={() => updatePillar(p, { active: !p.active })} />
            <button
              onClick={() => deletePillar(p.id)}
              className="text-muted hover:text-bad text-[17px] font-bold border-0 bg-transparent px-[4px] cursor-pointer leading-none flex-shrink-0"
              aria-label="Delete pillar"
            >×</button>
          </div>
        ))}

        {addingPillar ? (
          <form onSubmit={addPillar} className={`flex gap-2 items-center py-[11px] ${DIV}`}>
            <Input
              className="flex-1"
              placeholder="New pillar name…"
              value={newPillar}
              onChange={(e) => setNewPillar(e.target.value)}
              autoFocus
            />
            <Button type="submit" size="small" disabled={!newPillar.trim()}>Add</Button>
            <button
              type="button"
              onClick={() => { setAddingPillar(false); setNewPillar('') }}
              className="text-[12px] font-semibold text-muted border-0 bg-transparent cursor-pointer px-1"
            >Cancel</button>
          </form>
        ) : (
          <GhostBtn onClick={() => setAddingPillar(true)}>+ Add a pillar</GhostBtn>
        )}
      </SetSection>

      {/* ── 3. Competitors ──────────────────────────────────── */}
      <SetSection icon="🔥" title="Competitors you track" subtitle="Public posts only — used to spot trends to match">
        {settings.competitor_handles.map((handle, i) => {
          const initials = handle.replace('@', '').slice(0, 2).toUpperCase()
          return (
            <div key={i} className={`flex items-center gap-[10px] py-[11px] ${DIV}`}>
              <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-[#33425f] to-[#1a2b4a] text-white flex items-center justify-center text-[10.5px] font-bold flex-shrink-0">
                {initials}
              </div>
              <span className="flex-1 text-[13px] font-semibold text-navy">{handle}</span>
              <button
                onClick={() =>
                  patchLocal({ competitor_handles: settings.competitor_handles.filter((_, j) => j !== i) })
                }
                className="text-muted hover:text-bad text-[17px] font-bold border-0 bg-transparent px-[4px] cursor-pointer leading-none"
                aria-label="Remove"
              >×</button>
            </div>
          )
        })}

        {addingHandle ? (
          <div className={`flex gap-2 items-center py-[11px] ${DIV}`}>
            <Input
              className="flex-1"
              placeholder="@handle"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHandle()}
              autoFocus
            />
            <Button size="small" onClick={addHandle} disabled={!newHandle.trim()}>Add</Button>
            <button
              onClick={() => { setAddingHandle(false); setNewHandle('') }}
              className="text-[12px] font-semibold text-muted border-0 bg-transparent cursor-pointer px-1"
            >Cancel</button>
          </div>
        ) : (
          <GhostBtn onClick={() => setAddingHandle(true)}>+ Add account</GhostBtn>
        )}
      </SetSection>

      {/* ── 4. Content strategy ─────────────────────────────── */}
      <SetSection icon="🎯" title="Content strategy" subtitle="Shifts your mix around the exam calendar">
        <SetRow label="Adaptive strategy" sublabel="Auto-adjusts pillar focus over time" first>
          <Toggle on={true} onChange={() => {}} disabled />
        </SetRow>
        <SetRow label="Current focus" sublabel="Based on your exam calendar">
          <span className="text-[12px] font-bold text-orange-600">Auto</span>
        </SetRow>
      </SetSection>

      {/* ── 5. Business foundation ──────────────────────────── */}
      <SetSection icon="🧭" title="Business foundation" subtitle="What the AI uses to stay on-brand">
        <Field label="Who we serve">
          <Input
            className="bg-cream"
            value={settings.bf_who_we_serve ?? ''}
            onChange={(e) => patchLocal({ bf_who_we_serve: e.target.value })}
            placeholder="e.g. JEE / NEET students and their teachers"
          />
        </Field>
        <Field label="Core values">
          <Input
            className="bg-cream"
            value={settings.bf_core_values ?? ''}
            onChange={(e) => patchLocal({ bf_core_values: e.target.value })}
            placeholder="e.g. affordable, student-first, honest"
          />
        </Field>
        <Field label="Topics we like to post">
          <Input
            className="bg-cream"
            value={settings.bf_liked_topics ?? ''}
            onChange={(e) => patchLocal({ bf_liked_topics: e.target.value })}
            placeholder="e.g. Exam news, PYQ solving, revision strategy"
          />
        </Field>
        <Field label="Never post" note="· hard rules for the critic">
          <Textarea
            className="min-h-[80px] bg-[#fbe9ec] border-[#f3d4da] text-[#a3324b] focus:border-[#c2415c] focus:shadow-none"
            value={lines(settings.bf_never_post)}
            onChange={(e) => patchLocal({ bf_never_post: parseLines(e.target.value) })}
            placeholder={'No fake promises or guaranteed ranks\nNever name competitors\nNo fear-selling'}
          />
        </Field>
      </SetSection>

      {/* ── 6. Keep-in-English ──────────────────────────────── */}
      <SetSection icon="🔤" title="Keep-in-English list" subtitle="Terms that stay in English during content generation">
        <div className={`py-[11px] ${DIV}`}>
          <Textarea
            value={lines(settings.english_allowlist)}
            onChange={(e) => patchLocal({ english_allowlist: parseLines(e.target.value) })}
            placeholder={'JEE\nNEET\nCUET\nExamBro'}
          />
          <p className="text-[11px] text-muted mt-[6px] m-0">One term per line</p>
        </div>
      </SetSection>

      {/* ── 7. Target audience ──────────────────────────────── */}
      <SetSection icon="📍" title="Target audience" subtitle="Optional — helps the writing fit your readers">
        <Field label="Country">
          <Input
            className="bg-cream"
            value={settings.ta_country ?? ''}
            onChange={(e) => patchLocal({ ta_country: e.target.value })}
            placeholder="India"
          />
        </Field>
        <Field label="State / region">
          <Input
            className="bg-cream"
            value={settings.ta_state ?? ''}
            onChange={(e) => patchLocal({ ta_state: e.target.value })}
            placeholder="Gujarat"
          />
        </Field>
        <Field label="City" note="· optional">
          <Input
            className="bg-cream"
            value={settings.ta_city ?? ''}
            onChange={(e) => patchLocal({ ta_city: e.target.value })}
            placeholder="Leave blank for wider reach"
          />
        </Field>
      </SetSection>

      {/* Bottom save */}
      <div className="flex justify-end mt-2 mb-8">
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </div>
  )
}
