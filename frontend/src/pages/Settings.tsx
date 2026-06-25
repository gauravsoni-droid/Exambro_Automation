'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { AppSettings, Cadence, Pillar } from '../types'
import Button from '../components/Button'
import { Input } from '../components/Input'
import Toggle from '../components/Toggle'
import SegControl from '../components/SegControl'
import { useToast } from '../components/Toast'

const CADENCE_OPTIONS = [
  { label: 'Daily',     value: 'daily' },
  { label: 'Every 2 d', value: 'every_2_days' },
]

const LANGUAGE_OPTIONS = [
  { label: 'Hindi',   value: 'hi' },
  { label: 'English', value: 'en' },
]

const PILLAR_COLORS = ['#2b6cb0', '#f5a623', '#2e9b6b', '#6b53c4', '#c2415c', '#e67333', '#1c5f94']

// ── Layout helpers ─────────────────────────────────────────────

function Section({ title, subtitle, right, children }: {
  title: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="flex items-start justify-between mb-[8px] gap-3">
        <div>
          <h2 className="text-[10.5px] font-bold uppercase tracking-[.12em] text-muted m-0 leading-none">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-muted m-0 mt-[4px] leading-snug font-normal">
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </div>
      <div className="bg-white border border-border rounded-[13px] overflow-hidden shadow-card-sm">
        {children}
      </div>
    </div>
  )
}

function Row({ label, children, dim }: { label: string; children: ReactNode; dim?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 border-b border-border last:border-b-0 ${dim ? 'opacity-40' : ''}`}>
      <span className="w-[120px] flex-shrink-0 text-[11.5px] font-semibold text-muted py-[11px] leading-none">
        {label}
      </span>
      <div className="flex-1 min-w-0 py-[8px]">{children}</div>
    </div>
  )
}

function BareInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-white border border-border rounded-[10px] text-text px-[0.9rem] py-[0.75rem] text-[0.95rem] font-sans transition-all duration-200 ease-in-out placeholder:text-[#a9a9a9] focus:outline-none focus:border-accent focus:shadow-[0_0_0_4px_rgba(43,136,202,0.12)]"
    />
  )
}

function PhaseChip({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[.08em] text-muted bg-[#f0f0f0] border border-border rounded-[6px] px-[7px] py-[3px] leading-none flex-shrink-0">
      {label}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────

export default function Settings() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [pillars, setPillars]   = useState<Pillar[]>([])

  const [newPillar, setNewPillar]       = useState('')
  const [addingPillar, setAddingPillar] = useState(false)

  const [newHandle, setNewHandle]       = useState('')

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

  // ── Pillar helpers ─────────────────────────────────────────

  async function addPillar(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!newPillar.trim()) return
    try {
      await api.post('/pillars', { name: newPillar.trim(), sort_order: pillars.length + 1 })
      setNewPillar('')
      setAddingPillar(false)
      await load()
      toast('Pillar added')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Add pillar failed')
      toast('Add pillar failed', 'error')
    }
  }

  async function updatePillar(p: Pillar, changes: Partial<Pillar>) {
    try {
      await api.patch(`/pillars/${p.id}`, {
        name: p.name, description: p.description,
        active: p.active, sort_order: p.sort_order, ...changes,
      })
      await load()
      if (changes.active !== undefined) {
        toast(changes.active ? 'Pillar enabled' : 'Pillar disabled')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed')
      toast('Update failed', 'error')
    }
  }

  async function deletePillar(id: string) {
    try {
      await api.delete(`/pillars/${id}`)
      await load()
      toast('Pillar removed')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed')
      toast('Delete failed', 'error')
    }
  }

  async function movePillar(p: Pillar, dir: -1 | 1) {
    const idx = pillars.findIndex((x) => x.id === p.id)
    const swap = pillars[idx + dir]
    if (!swap) return
    await Promise.all([
      api.patch(`/pillars/${p.id}`, { ...p, sort_order: swap.sort_order }),
      api.patch(`/pillars/${swap.id}`, { ...swap, sort_order: p.sort_order }),
    ])
    await load()
  }

  // ── Competitor handle helpers ──────────────────────────────

  function addHandle() {
    if (!newHandle.trim() || !settings) return
    const handle = newHandle.trim().replace(/^@/, '')
    if (!handle) return
    if (settings.competitor_handles.includes(handle)) { setNewHandle(''); return }
    patchLocal({ competitor_handles: [...settings.competitor_handles, handle] })
    setNewHandle('')
  }

  function removeHandle(h: string) {
    if (!settings) return
    patchLocal({ competitor_handles: settings.competitor_handles.filter((x) => x !== h) })
  }

  // ── Loading ────────────────────────────────────────────────
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

      {/* ── 1. Posting Rhythm ──────────────────────────────── */}
      <Section title="Posting Rhythm" subtitle="How often you get a topic to approve">
        <div className="flex items-center justify-between px-4 py-[12px]">
          <span className="text-[13px] font-semibold text-text">Cadence</span>
          <SegControl
            options={CADENCE_OPTIONS}
            value={settings.cadence}
            onChange={(v) => patchLocal({ cadence: v as Cadence })}
          />
        </div>
      </Section>

      {/* ── 2. Content Pillars ─────────────────────────────── */}
      <Section title="Content Pillars" subtitle="Your themes — the flow rotates through these">
        {pillars.length === 0 && (
          <div className="px-4 py-3 text-[12px] text-muted italic">No pillars yet</div>
        )}
        {pillars.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-[10px] border-b border-border last:border-b-0">
            <div className="flex flex-col gap-[2px] flex-shrink-0">
              <button
                onClick={() => movePillar(p, -1)}
                disabled={i === 0}
                className="w-4 h-[10px] flex items-center justify-center text-muted hover:text-text disabled:opacity-20 border-0 bg-transparent cursor-pointer p-0 leading-none text-[8px]"
                aria-label="Move up"
              >▲</button>
              <button
                onClick={() => movePillar(p, 1)}
                disabled={i === pillars.length - 1}
                className="w-4 h-[10px] flex items-center justify-center text-muted hover:text-text disabled:opacity-20 border-0 bg-transparent cursor-pointer p-0 leading-none text-[8px]"
                aria-label="Move down"
              >▼</button>
            </div>
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
            >Cancel</button>
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

      {/* ── 3. Competitors You Track ───────────────────────── */}
      <Section title="Competitors You Track" subtitle="Public posts only — used to spot trends to match">
        {settings.competitor_handles.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-muted italic">No handles added yet</div>
        ) : (
          settings.competitor_handles.map((h) => (
            <div key={h} className="flex items-center gap-3 px-4 py-[10px] border-b border-border last:border-b-0">
              <span className="flex-1 text-[13px] font-semibold text-text">@{h}</span>
              <button
                onClick={() => removeHandle(h)}
                className="text-muted hover:text-bad text-[16px] font-bold border-0 bg-transparent cursor-pointer leading-none flex-shrink-0 w-5 text-center"
                aria-label={`Remove @${h}`}
              >×</button>
            </div>
          ))
        )}
        <div className="flex gap-2 items-center px-4 py-[10px] border-t border-border">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[13px] font-semibold text-muted flex-shrink-0 leading-none">@</span>
            <input
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHandle())}
              placeholder="instagram_handle"
              className="flex-1 bg-white border border-border rounded-[10px] text-text px-[0.9rem] py-[0.75rem] text-[0.95rem] font-sans transition-all duration-200 ease-in-out placeholder:text-[#a9a9a9] focus:outline-none focus:border-accent focus:shadow-[0_0_0_4px_rgba(43,136,202,0.12)]"
            />
          </div>
          <button
            onClick={addHandle}
            disabled={!newHandle.trim()}
            className="bg-text text-white rounded-[9px] px-3 py-[7px] text-[12px] font-bold border-0 cursor-pointer hover:bg-navy disabled:opacity-40 transition-colors flex-shrink-0"
          >Add</button>
        </div>
      </Section>

      {/* ── 4. Content Strategy ────────────────────────────── */}
      <Section
        title="Content Strategy"
        subtitle="Shifts your mix around the exam calendar"
        right={<PhaseChip label="Phase 3" />}
      >
        <Row label="Adaptive strategy" dim>
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-muted">Auto-rotates topics by exam season</span>
            <Toggle on={false} onChange={() => {}} disabled />
          </div>
        </Row>
        <Row label="Current focus" dim>
          <span className="text-[13px] font-medium text-muted">JEE Mains season</span>
        </Row>
      </Section>

      {/* ── 5. Publishing ──────────────────────────────────── */}
      <Section
        title="Publishing"
        subtitle="Hands-free posting of approved image posts"
        right={<PhaseChip label="Phase 4" />}
      >
        <Row label="Instagram" dim>
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-muted">Not connected</span>
            <span className="text-[11px] font-bold text-muted bg-[#f0f0f0] border border-border rounded-[6px] px-2 py-[3px]">Connect</span>
          </div>
        </Row>
        <Row label="Auto-publish">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-muted">Posts to Instagram after you approve</span>
            <Toggle
              on={settings?.ig_auto_publish ?? false}
              onChange={() => patchLocal({ ig_auto_publish: !(settings?.ig_auto_publish ?? false) })}
            />
          </div>
        </Row>
      </Section>

      {/* ── 6. Business Foundation ─────────────────────────── */}
      <Section title="Business Foundation" subtitle="What the AI uses to stay on-brand">
        <Row label="Brand Name">
          <BareInput
            value={settings.bf_brand_name ?? ''}
            onChange={(e) => patchLocal({ bf_brand_name: e.target.value })}
            placeholder="ExamBro"
          />
        </Row>
        <Row label="Target Audience">
          <BareInput
            value={settings.ta_who ?? ''}
            onChange={(e) => patchLocal({ ta_who: e.target.value })}
            placeholder="Class 11–12 students preparing for JEE/NEET (optional)"
          />
        </Row>
        <Row label="Country">
          <BareInput
            value={settings.ta_country ?? ''}
            onChange={(e) => patchLocal({ ta_country: e.target.value })}
            placeholder="India"
          />
        </Row>
        <Row label="State">
          <BareInput
            value={settings.ta_state ?? ''}
            onChange={(e) => patchLocal({ ta_state: e.target.value })}
            placeholder="Gujarat"
          />
        </Row>
        <Row label="City">
          <BareInput
            value={settings.ta_city ?? ''}
            onChange={(e) => patchLocal({ ta_city: e.target.value })}
            placeholder="Optional"
          />
        </Row>
        <Row label="Primary Exams">
          <BareInput
            value={settings.bf_who_we_serve ?? ''}
            onChange={(e) => patchLocal({ bf_who_we_serve: e.target.value })}
            placeholder="JEE, NEET, CUET, GUJCET"
          />
        </Row>
        <Row label="Language">
          <div className="py-[7px]">
            <SegControl
              options={LANGUAGE_OPTIONS}
              value={settings.content_language ?? 'hi'}
              onChange={(v) => patchLocal({ content_language: v })}
            />
          </div>
        </Row>
      </Section>

      {/* bottom padding */}
      <div className="pb-8" />
    </div>
  )
}
