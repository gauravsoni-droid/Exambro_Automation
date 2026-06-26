'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { AppSettings, Cadence, Pillar } from '../types'
import Button from '../components/Button'
import { Input, Textarea } from '../components/Input'
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

// ── Layout helpers ──────────────────────────────────────────────

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

// Inline row: fixed-width label on left, control on right
function Row({ label, children, dim }: { label: string; children: ReactNode; dim?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 border-b border-border last:border-b-0 ${dim ? 'opacity-40' : ''}`}>
      <span className="w-[130px] flex-shrink-0 text-[11.5px] font-semibold text-muted py-[11px] leading-none">
        {label}
      </span>
      <div className="flex-1 min-w-0 py-[8px]">{children}</div>
    </div>
  )
}

// Stacked row: label above, full-width content below
function StackRow({ label, hint, children, dim }: {
  label: string
  hint?: string
  children: ReactNode
  dim?: boolean
}) {
  return (
    <div className={`px-4 py-[12px] border-b border-border last:border-b-0 ${dim ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-baseline justify-between mb-[7px]">
        <span className="text-[11.5px] font-semibold text-muted leading-none">{label}</span>
        {hint && <span className="text-[10.5px] text-muted font-normal italic">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function PhaseChip({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[.08em] text-muted bg-[#f0f0f0] border border-border rounded-[6px] px-[7px] py-[3px] leading-none flex-shrink-0">
      {label}
    </span>
  )
}

function HelperText({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-medium text-muted m-0 mt-[7px] leading-[1.55]">{children}</p>
  )
}

// ── TagsInput ───────────────────────────────────────────────────

function TagsInput({
  tags,
  onAdd,
  onRemove,
  placeholder = 'Type and press Enter…',
  disabled = false,
  prefix,
}: {
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  placeholder?: string
  disabled?: boolean
  prefix?: string
}) {
  const [value, setValue] = useState('')

  function commit() {
    const v = value.trim().replace(/,+$/, '').trim()
    if (!v) { setValue(''); return }
    // Strip the display prefix if the user typed it
    const clean = prefix ? v.replace(new RegExp(`^${prefix}`), '').trim() : v
    if (!clean || tags.includes(clean)) { setValue(''); return }
    onAdd(clean)
    setValue('')
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-[5px] mb-[8px]">
          {tags.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-[4px] bg-bg border border-border rounded-full pl-[9px] pr-[6px] py-[4px] text-[12px] font-medium text-text"
            >
              {prefix && <span className="text-muted text-[11px]">{prefix}</span>}
              {t}
              {!disabled && (
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onRemove(t)}
                  className="text-muted hover:text-bad text-[14px] font-bold border-0 bg-transparent cursor-pointer leading-none w-[16px] h-[16px] flex items-center justify-center flex-shrink-0"
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
              if (e.key === 'Backspace' && !value && tags.length) onRemove(tags[tags.length - 1])
            }}
            onBlur={commit}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-white border border-border rounded-[10px] text-text px-[0.9rem] py-[0.75rem] text-[0.95rem] font-sans transition-all duration-200 ease-in-out placeholder:text-[#a9a9a9] focus:outline-none focus:border-accent focus:shadow-[0_0_0_4px_rgba(43,136,202,0.12)]"
          />
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={commit}
            disabled={!value.trim()}
            className="bg-text text-white rounded-[9px] px-3 py-[7px] text-[12px] font-bold border-0 cursor-pointer hover:opacity-80 disabled:opacity-40 transition-all flex-shrink-0"
          >
            Add
          </button>
        </div>
      )}
      {disabled && tags.length === 0 && (
        <p className="text-[12px] text-muted italic m-0">None configured</p>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────

export default function Settings() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [pillars, setPillars]   = useState<Pillar[]>([])

  const [newPillar, setNewPillar]       = useState('')
  const [addingPillar, setAddingPillar] = useState(false)

  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy]   = useState(false)

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
    setSettings(s => s ? { ...s, ...changes } : s)
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
    const idx = pillars.findIndex(x => x.id === p.id)
    const swap = pillars[idx + dir]
    if (!swap) return
    await Promise.all([
      api.patch(`/pillars/${p.id}`, { ...p, sort_order: swap.sort_order }),
      api.patch(`/pillars/${swap.id}`, { ...swap, sort_order: p.sort_order }),
    ])
    await load()
  }

  // ── bf_liked_topics helpers (DB stores as comma-separated text) ──

  function likedTopics(): string[] {
    return (settings?.bf_liked_topics ?? '').split(',').map(s => s.trim()).filter(Boolean)
  }

  function addLikedTopic(tag: string) {
    patchLocal({ bf_liked_topics: [...likedTopics(), tag].join(', ') })
  }

  function removeLikedTopic(tag: string) {
    const next = likedTopics().filter(t => t !== tag)
    patchLocal({ bf_liked_topics: next.join(', ') })
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

  const adaptiveOn = settings.adaptive_strategy_enabled

  return (
    <div>
      {/* ── Sticky save header ─────────────────────────────── */}
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
        <Row label="Cadence">
          <SegControl
            options={CADENCE_OPTIONS}
            value={settings.cadence}
            onChange={v => patchLocal({ cadence: v as Cadence })}
          />
        </Row>
        <Row label="Language">
          <SegControl
            options={LANGUAGE_OPTIONS}
            value={settings.content_language ?? 'hi'}
            onChange={v => patchLocal({ content_language: v })}
          />
        </Row>
      </Section>

      {/* ── 2. Content Pillars ─────────────────────────────── */}
      <Section title="Content Pillars" subtitle="Your themes — the AI rotates through these in order">
        {pillars.length === 0 && (
          <div className="px-4 py-3 text-[12px] text-muted italic">No pillars yet</div>
        )}
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
              aria-label="Delete pillar"
            >×</button>
          </div>
        ))}

        {addingPillar ? (
          <form onSubmit={addPillar} className="flex gap-2 items-center px-4 py-[10px] border-t border-border">
            <Input
              className="flex-1 py-[7px] text-[13px]"
              placeholder="Pillar name…"
              value={newPillar}
              onChange={e => setNewPillar(e.target.value)}
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

      {/* ── 3. Business Foundation ─────────────────────────── */}
      <Section title="Business Foundation" subtitle="What the AI uses to stay on-brand across all content">
        <Row label="Brand Name">
          <Input
            value={settings.bf_brand_name ?? ''}
            onChange={e => patchLocal({ bf_brand_name: e.target.value || null })}
            placeholder="ExamBro"
          />
        </Row>
        <Row label="Who We Serve">
          <Input
            value={settings.bf_who_we_serve ?? ''}
            onChange={e => patchLocal({ bf_who_we_serve: e.target.value || null })}
            placeholder="JEE, NEET, CUET, GUJCET aspirants"
          />
        </Row>
        <StackRow label="Core Values" hint="Optional">
          <Textarea
            value={settings.bf_core_values ?? ''}
            onChange={e => patchLocal({ bf_core_values: e.target.value || null })}
            placeholder="Encouraging, practical, student-first. Never preachy or salesy."
            rows={3}
          />
          <HelperText>Used to shape the writer's tone across every post.</HelperText>
        </StackRow>
        <StackRow label="Topics We Like to Post" hint="Optional">
          <TagsInput
            tags={likedTopics()}
            onAdd={addLikedTopic}
            onRemove={removeLikedTopic}
            placeholder="Add a topic and press Enter…"
          />
          <HelperText>The AI naturally leans towards topics in this list when suggesting content.</HelperText>
        </StackRow>
        <StackRow label="Never Post">
          <TagsInput
            tags={settings.bf_never_post}
            onAdd={tag => patchLocal({ bf_never_post: [...settings.bf_never_post, tag] })}
            onRemove={tag => patchLocal({ bf_never_post: settings.bf_never_post.filter(t => t !== tag) })}
            placeholder="Add a rule and press Enter…"
          />
          <HelperText>Hard rules — the critic automatically fails any draft that violates these.</HelperText>
        </StackRow>
      </Section>

      {/* ── 4. Target Audience ─────────────────────────────── */}
      <Section title="Target Audience" subtitle="Guides tone, examples and regional references — not an IG targeting control">
        <Row label="Country">
          <Input
            value={settings.ta_country ?? ''}
            onChange={e => patchLocal({ ta_country: e.target.value || null })}
            placeholder="India"
          />
        </Row>
        <Row label="State">
          <Input
            value={settings.ta_state ?? ''}
            onChange={e => patchLocal({ ta_state: e.target.value || null })}
            placeholder="Gujarat"
          />
        </Row>
        <Row label="City">
          <Input
            value={settings.ta_city ?? ''}
            onChange={e => patchLocal({ ta_city: e.target.value || null })}
            placeholder="Optional"
          />
        </Row>
        <Row label="Who They Are">
          <Input
            value={settings.ta_who ?? ''}
            onChange={e => patchLocal({ ta_who: e.target.value || null })}
            placeholder="Class 11–12 students preparing for JEE / NEET"
          />
        </Row>
      </Section>

      {/* ── 5. Content Strategy ────────────────────────────── */}
      <Section
        title="Content Strategy"
        subtitle="Automatically shifts your content mix around the exam calendar"
        right={<PhaseChip label="Phase 3" />}
      >
        <Row label="Adaptive Strategy">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-muted">Auto-rotates topics by exam season</span>
            <Toggle
              on={adaptiveOn}
              onChange={() => patchLocal({ adaptive_strategy_enabled: !adaptiveOn })}
            />
          </div>
        </Row>
        <Row label="Current Focus" dim={!adaptiveOn}>
          {adaptiveOn ? (
            <span className="text-[13px] font-medium text-text">JEE Mains season</span>
          ) : (
            <span className="text-[12px] text-muted italic">
              Enable Adaptive Strategy above to use automatic focus.
            </span>
          )}
        </Row>
      </Section>

      {/* ── 6. Competitors ─────────────────────────────────── */}
      <Section title="Competitors You Track" subtitle="Handles monitored for trending angles and content gaps">
        <StackRow label="Instagram Handles">
          <TagsInput
            tags={settings.competitor_handles}
            onAdd={tag => {
              const clean = tag.replace(/^@/, '').trim()
              if (!clean || settings.competitor_handles.includes(clean)) return
              patchLocal({ competitor_handles: [...settings.competitor_handles, clean] })
            }}
            onRemove={tag => patchLocal({
              competitor_handles: settings.competitor_handles.filter(h => h !== tag)
            })}
            placeholder="@handle or paste without @"
            prefix="@"
          />
          <HelperText>
            Competitor posts are used only for trend discovery, never copied. Public accounts only.
          </HelperText>
        </StackRow>
      </Section>

      {/* ── 7. Publishing ──────────────────────────────────── */}
      <Section
        title="Publishing"
        subtitle="Automatic posting to Instagram after you approve"
        right={<PhaseChip label="Phase 4" />}
      >
        <Row label="Instagram">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[7px]">
              <span className="w-[7px] h-[7px] rounded-full bg-border flex-shrink-0" />
              <span className="text-[12.5px] text-muted">Not connected</span>
            </div>
            <span className="text-[10.5px] font-semibold text-muted bg-[#f4f4f4] border border-border rounded-[6px] px-[8px] py-[4px] leading-none">
              Configure in .env
            </span>
          </div>
        </Row>
        <Row label="Auto-publish">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-muted">Posts to Instagram after you approve</span>
            <Toggle
              on={settings.ig_auto_publish}
              onChange={() => patchLocal({ ig_auto_publish: !settings.ig_auto_publish })}
            />
          </div>
        </Row>
      </Section>

      <div className="pb-8" />
    </div>
  )
}
