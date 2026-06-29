'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { Post } from '../types'
import Modal from '../components/Modal'
import Button from '../components/Button'
import TapTracker from '../components/TapTracker'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SceneData {
  index: number
  title: string
  dialogue: string
  camera: string
  expression: string
  onScreenText: string
  sfx: string
  duration: string
}

interface ParsedScript {
  hook: string
  scenes: SceneData[]
  cta: string
  onScreenSummary: string[]
  editingNotes: string[]
  whyItWorks: string
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseScript(raw: string): ParsedScript {
  const result: ParsedScript = {
    hook: '', scenes: [], cta: '',
    onScreenSummary: [], editingNotes: [], whyItWorks: '',
  }
  if (!raw.trim()) return result

  type Sec = 'hook' | 'scene' | 'cta' | 'onscreen' | 'editing' | 'why'
  let sec: Sec | null = null
  let sceneLines: string[] = []
  let sceneMeta: { index: number; title: string } | null = null
  let buf: string[] = []

  function finalizeScene() {
    if (!sceneMeta) return
    const s: SceneData = {
      index: sceneMeta.index, title: sceneMeta.title,
      dialogue: '', camera: '', expression: '',
      onScreenText: '', sfx: '', duration: '',
    }
    for (const l of sceneLines) {
      const t = l.trim()
      if      (t.startsWith('Dialogue:')) s.dialogue     = t.replace(/^Dialogue:\s*/, '')
      else if (t.startsWith('🎥'))        s.camera       = t.replace(/^🎥[^:]*:\s*/, '')
      else if (t.startsWith('😀'))        s.expression   = t.replace(/^😀[^:]*:\s*/, '')
      else if (t.startsWith('📝'))        s.onScreenText = t.replace(/^📝[^:]*:\s*/, '')
      else if (t.startsWith('🔊'))        s.sfx          = t.replace(/^🔊[^:]*:\s*/, '')
      else if (t.startsWith('⏱'))        s.duration     = t.replace(/^⏱[^:]*:\s*/, '')
    }
    result.scenes.push(s)
    sceneMeta = null
    sceneLines = []
  }

  function flush() {
    const text = buf.join('\n').trim()
    const lines = buf.map(l => l.trim()).filter(Boolean).map(l => l.replace(/^[-•·]\s*/, ''))
    if (sec === 'hook')     result.hook            = text
    if (sec === 'cta')      result.cta             = text
    if (sec === 'onscreen') result.onScreenSummary = lines
    if (sec === 'editing')  result.editingNotes    = lines
    if (sec === 'why')      result.whyItWorks      = text
    buf = []
  }

  for (const line of raw.split('\n')) {
    if      (/^🎯/.test(line)) { flush(); finalizeScene(); sec = 'hook';     buf = [] }
    else if (/^🎬/.test(line)) {
      flush(); finalizeScene(); sec = 'scene'
      const m = line.match(/🎬\s+SCENE\s+(\d+)\s*[—–-]\s*(.+)/i)
      sceneMeta = { index: result.scenes.length + 1, title: m?.[2]?.trim() ?? '' }
      sceneLines = []
    }
    else if (/^📢/.test(line)) { flush(); finalizeScene(); sec = 'cta';      buf = [] }
    else if (/^📱/.test(line)) { flush(); finalizeScene(); sec = 'onscreen'; buf = [] }
    else if (/^🎵/.test(line)) { flush(); finalizeScene(); sec = 'editing';  buf = [] }
    else if (/^💡/.test(line)) { flush(); finalizeScene(); sec = 'why';      buf = [] }
    else {
      if (sec === 'scene') sceneLines.push(line)
      else buf.push(line)
    }
  }
  flush()
  finalizeScene()
  return result
}

// ── Asset detection ───────────────────────────────────────────────────────────

const ASSET_PATTERNS: [RegExp, string][] = [
  [/admit card|hall ticket/i,        'Admit Card / Hall Ticket'],
  [/fingerprint|scanner/i,          'Fingerprint Graphic / VFX'],
  [/countdown/i,                     'Countdown Animation'],
  [/screen record|phone screen/i,    'Screen Recording Setup'],
  [/checklist|tick mark/i,           'Checklist Animation'],
  [/whiteboard/i,                    'Whiteboard'],
  [/textbook|mock paper|open book/i, 'Textbook / Mock Paper'],
  [/split.screen/i,                  'Split-Screen Setup'],
  [/text overlay|bold text/i,        'Text Overlay (editing)'],
  [/\btimer\b/i,                     'Timer Prop'],
]

function detectAssets(scenes: SceneData[]): string[] {
  const combined = scenes
    .flatMap(s => [s.camera, s.onScreenText, s.dialogue, s.sfx])
    .join(' ')
  return [
    'Phone',
    ...ASSET_PATTERNS.filter(([re]) => re.test(combined)).map(([, label]) => label),
  ]
}

function estimateDuration(scenes: SceneData[]): string {
  let total = 7 // hook ~3s + CTA ~4s
  for (const s of scenes) {
    const m = s.duration.match(/(\d+)/)
    if (m) total += parseInt(m[1])
  }
  return scenes.some(s => s.duration) ? `~${total}s` : '30–45s'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HookCard({ hook }: { hook: string }) {
  if (!hook) return null
  return (
    <div className="rounded-[18px] border border-orange/25 bg-gradient-to-br from-orange/6 to-transparent px-5 py-4">
      <p className="m-0 mb-2 text-[10px] font-extrabold uppercase tracking-[.14em] text-orange">
        🎯 Hook — 0–3s
      </p>
      <p className="m-0 text-[18px] font-bold leading-[1.5] text-text">
        &ldquo;{hook}&rdquo;
      </p>
    </div>
  )
}

function SceneCard({ scene, total }: { scene: SceneData; total: number }) {
  const cues = [
    { emoji: '🎥', label: 'Camera',         value: scene.camera },
    { emoji: '😀', label: 'Expression',     value: scene.expression },
    { emoji: '📝', label: 'On-screen Text', value: scene.onScreenText },
    { emoji: '🔊', label: 'SFX',            value: scene.sfx },
  ].filter(c => c.value && !/^none$/i.test(c.value.trim()))

  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-white shadow-[0_1px_6px_rgba(0,0,0,.05)]">
      {/* Scene header */}
      <div className="flex items-center justify-between border-b border-border bg-[#f4f8fd] px-5 py-[10px]">
        <div className="flex min-w-0 items-center gap-[6px]">
          <span className="flex-shrink-0 text-[10.5px] font-extrabold uppercase tracking-[.12em] text-accent">
            🎬 Scene {scene.index}
          </span>
          {scene.title && (
            <span className="truncate text-[11px] font-medium text-muted">
              of {total} — {scene.title}
            </span>
          )}
        </div>
        {scene.duration && (
          <span className="ml-3 flex-shrink-0 rounded-full bg-accent/10 px-[10px] py-[3px] text-[10.5px] font-bold text-accent">
            ⏱ {scene.duration}
          </span>
        )}
      </div>

      {/* Dialogue — prominent */}
      {scene.dialogue && (
        <div className="border-b border-border/50 px-5 pb-[14px] pt-4">
          <p className="m-0 mb-[6px] text-[9.5px] font-bold uppercase tracking-[.12em] text-muted">
            🗣 Dialogue
          </p>
          <p className="m-0 text-[17px] font-semibold italic leading-[1.55] text-text">
            &ldquo;{scene.dialogue}&rdquo;
          </p>
        </div>
      )}

      {/* Creator cues */}
      {cues.length > 0 && (
        <div className="divide-y divide-border/40">
          {cues.map(cue => (
            <div key={cue.label} className="flex items-start gap-3 px-5 py-[10px]">
              <span className="mt-[2px] flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-[#f0f5fa] text-[13px]">
                {cue.emoji}
              </span>
              <div className="min-w-0">
                <p className="m-0 mb-[2px] text-[9.5px] font-bold uppercase tracking-[.1em] text-muted">
                  {cue.label}
                </p>
                <p className="m-0 text-[13px] font-medium leading-snug text-text">{cue.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AssetChecklist({ assets }: { assets: string[] }) {
  if (assets.length === 0) return null
  return (
    <div className="rounded-[16px] border border-[#e8cc7a] bg-[#fffcf0] px-5 py-4">
      <p className="m-0 mb-3 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#8a5e08]">
        📦 Assets Checklist — prep before you shoot
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-[8px]">
        {assets.map(asset => (
          <div key={asset} className="flex items-center gap-[8px]">
            <span className="h-[15px] w-[15px] flex-shrink-0 rounded border-[1.5px] border-[#c9a234]" />
            <span className="text-[12.5px] font-medium leading-tight text-[#4a3200]">{asset}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CTABlock({ cta }: { cta: string }) {
  if (!cta) return null
  return (
    <div className="rounded-[16px] border border-good/25 bg-gradient-to-br from-good/6 to-transparent px-5 py-4">
      <p className="m-0 mb-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-good">📢 CTA</p>
      <p className="m-0 whitespace-pre-wrap text-[14px] font-medium leading-[1.65] text-text">{cta}</p>
    </div>
  )
}

function OnScreenSummary({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="rounded-[16px] border border-border bg-white px-5 py-4">
      <p className="m-0 mb-3 text-[10px] font-extrabold uppercase tracking-[.12em] text-muted">
        📱 On-screen Text Summary
      </p>
      <div className="flex flex-col gap-[7px]">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-[8px]">
            <span className="mt-[1px] flex-shrink-0 text-[11px] font-bold text-muted">{i + 1}.</span>
            <p className="m-0 text-[13px] font-medium leading-snug text-text">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function EditingCallout({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <div className="rounded-[16px] border border-[#bfd4f8] bg-[#eef4ff] px-5 py-4">
      <p className="m-0 mb-3 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#2b4eb5]">
        🎵 Editing Notes
      </p>
      <div className="flex flex-col gap-[8px]">
        {notes.map((note, i) => (
          <div key={i} className="flex items-start gap-[8px]">
            <span className="mt-[7px] h-[5px] w-[5px] flex-shrink-0 rounded-full bg-[#3b5fd4]" />
            <p className="m-0 text-[13px] font-medium leading-relaxed text-[#1c3080]">{note}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function WhyItWorks({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-5 py-[13px] text-left"
      >
        <span className="text-[10.5px] font-extrabold uppercase tracking-[.12em] text-muted">
          💡 Why This Reel Will Perform
        </span>
        <span
          className="ml-2 flex-shrink-0 text-[13px] text-muted transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="border-t border-border/60 px-5 pb-[14px] pt-3">
          <p className="m-0 whitespace-pre-wrap text-[13.5px] font-medium leading-[1.7] text-text">
            {text}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  post: Post
  generating: boolean
  onLoad: () => Promise<void>
}

export default function ReelScriptReview({ post, generating, onLoad }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [scriptEdit, setScriptEdit] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  const parsed      = parseScript(post.script ?? '')
  const assets      = detectAssets(parsed.scenes)
  const duration    = estimateDuration(parsed.scenes)
  const isFirstGen  = generating && !post.script
  const isRegenning = generating && !!post.script
  const canAct      = post.status === 'awaiting_approval' && !generating && !busy

  // Keyboard shortcuts — only when not editing
  useEffect(() => {
    if (editMode) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return
      if ((e.key === 'a' || e.key === 'A') && canAct && post.script) approve()
      if ((e.key === 'r' || e.key === 'R') && canAct) setShowRegenConfirm(true)
      if ((e.key === 'c' || e.key === 'C') && post.script) copyScript()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Esc exits edit mode
  useEffect(() => {
    if (!editMode) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setEditMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode])

  async function approve() {
    if (!canAct || !post.script) return
    setBusy(true); setError('')
    try {
      await api.post(`/posts/${post.id}/approve`)
      await onLoad()
      // component unmounts when status → saved; no state reset needed
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Approve failed')
      setBusy(false)
    }
  }

  async function reject() {
    if (busy) return
    setBusy(true); setError('')
    try {
      await api.post(`/posts/${post.id}/reject`)
      await onLoad()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Reject failed')
      setBusy(false)
    }
  }

  async function regenerate() {
    setShowRegenConfirm(false)
    setBusy(true); setError('')
    try {
      await api.post(`/posts/${post.id}/tweak`, {
        instruction:
          'Regenerate the reel script with a completely fresh angle — ' +
          'new hook, new examples, new story flow. Same topic and creator format.',
      })
      await onLoad()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Regenerate failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    setSavingEdit(true); setError('')
    try {
      await api.patch<Post>(`/posts/${post.id}`, { script: scriptEdit })
      setEditMode(false)
      await onLoad()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed')
    } finally {
      setSavingEdit(false)
    }
  }

  function copyScript() {
    if (!post.script) return
    navigator.clipboard.writeText(post.script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function downloadScript() {
    if (!post.script) return
    const slug = (post.topics?.title ?? post.id.slice(0, 8))
      .toLowerCase().replace(/\s+/g, '-').slice(0, 40)
    const blob = new Blob([post.script], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `reel-${slug}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const genTime = post.created_at
    ? new Date(post.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <>
      {/* ── Scrollable content ── */}
      <div className="max-w-[860px] pb-[104px]">
        <TapTracker step={2} />
        <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-orange">
          Tap 2 of 2 · reel script review
        </p>
        <h1 className="m-0 mb-3 text-[22px] font-extrabold leading-tight tracking-tight text-text">
          Reel Script
        </h1>

        {/* ── Status bar ── */}
        <div className="mb-4 flex min-h-[20px] items-center gap-[6px]">
          {generating ? (
            <>
              <span className="h-[7px] w-[7px] flex-shrink-0 animate-pulse rounded-full bg-orange" />
              <span className="text-[11.5px] font-semibold text-orange">
                {isRegenning ? 'Regenerating…' : 'Generating script…'}
              </span>
            </>
          ) : post.status === 'awaiting_approval' ? (
            <>
              <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-amber-400" />
              <span className="text-[11.5px] font-semibold text-amber-600">Ready for review</span>
              {genTime && <span className="text-[11px] text-muted">· {genTime}</span>}
            </>
          ) : null}
        </div>

        {error && <p className="m-0 mb-3 text-[0.88rem] text-bad">{error}</p>}

        {/* ── Header summary strip ── */}
        {!isFirstGen && !editMode && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-[6px] rounded-[14px] border border-border bg-white px-4 py-[10px] shadow-[0_1px_3px_rgba(0,0,0,.04)]">
            <span className="text-[12.5px] font-bold text-text">⏱ {duration}</span>
            <span className="text-border">|</span>
            <span className="text-[12px] font-medium text-muted">📱 Reel · 9:16</span>
            {post.topics?.title && (
              <>
                <span className="text-border">|</span>
                <span className="max-w-[200px] truncate text-[12px] font-medium text-text">
                  🎯 {post.topics.title}
                </span>
              </>
            )}
            {genTime && (
              <>
                <span className="text-border">|</span>
                <span className="text-[12px] font-medium text-muted">🕒 {genTime}</span>
              </>
            )}
          </div>
        )}

        {/* ── Script body ── */}
        {isFirstGen ? (
          <div className="flex flex-col items-center rounded-[16px] border border-border bg-white p-8 text-center shadow-[0_1px_6px_rgba(0,0,0,.05)]">
            <span className="mb-4 h-9 w-9 animate-spin rounded-full border-[3px] border-border border-t-orange" />
            <p className="m-0 mb-1 text-[14px] font-semibold text-text">Writing your reel script…</p>
            <p className="m-0 text-[12px] text-muted">Usually takes 15–25 seconds</p>
          </div>
        ) : editMode ? (
          <div className="overflow-hidden rounded-[16px] border border-border bg-white shadow-[0_1px_6px_rgba(0,0,0,.05)]">
            <div className="flex items-center justify-between border-b border-border bg-[#f8f9fb] px-4 py-[10px]">
              <span className="text-[10.5px] font-bold uppercase tracking-[.1em] text-accent">✏️ Editing script</span>
              <span className="text-[11px] text-muted">Esc to cancel</span>
            </div>
            <textarea
              value={scriptEdit}
              onChange={e => setScriptEdit(e.target.value)}
              className="min-h-[520px] w-full resize-y border-0 p-4 font-mono text-[12.5px] leading-[1.75] text-text outline-none"
              autoFocus
            />
          </div>
        ) : (
          <div className={`flex flex-col gap-3 ${isRegenning ? 'pointer-events-none opacity-60' : ''}`}>
            {isRegenning && (
              <div className="flex items-center justify-center gap-2 rounded-[12px] border border-orange/20 bg-orange/5 py-3 text-[13px] font-semibold text-orange">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange border-t-transparent" />
                Regenerating script…
              </div>
            )}

            <HookCard hook={parsed.hook} />

            {parsed.scenes.length > 0 && <AssetChecklist assets={assets} />}

            {parsed.scenes.map(scene => (
              <SceneCard key={scene.index} scene={scene} total={parsed.scenes.length} />
            ))}

            <CTABlock cta={parsed.cta} />
            <OnScreenSummary items={parsed.onScreenSummary} />
            <EditingCallout notes={parsed.editingNotes} />
            <WhyItWorks text={parsed.whyItWorks} />

            {canAct && (
              <p className="m-0 mt-1 text-center text-[10.5px] text-muted">
                A = Approve · R = Regenerate · C = Copy
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky floating action bar ── */}
      {post.status === 'awaiting_approval' && (
        <div className="sticky bottom-4 z-40">
          <div className="rounded-[20px] border border-border bg-white/95 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,.12)] backdrop-blur-sm">
            {editMode ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode(false)}
                  className="flex-1 cursor-pointer rounded-[12px] border-[1.5px] border-border bg-white py-[12px] text-[13px] font-semibold text-muted transition-colors hover:border-[#8b93a1]"
                >
                  Cancel
                </button>
                <Button onClick={saveEdit} disabled={savingEdit} className="flex-1 py-[12px]">
                  {savingEdit ? 'Saving…' : '💾 Save Script'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Primary CTA */}
                <Button
                  onClick={approve}
                  disabled={busy || !post.script || generating}
                  className="w-full py-[15px] text-[15px]"
                >
                  ✅ Approve Script
                </Button>

                {/* Secondary actions */}
                <div className="flex gap-2">
                  {(
                    [
                      {
                        label: '🔄 Regen',
                        onClick: () => setShowRegenConfirm(true),
                        disabled: busy || generating,
                      },
                      {
                        label: '✏️ Edit',
                        onClick: () => { setScriptEdit(post.script ?? ''); setEditMode(true) },
                        disabled: !post.script || generating,
                      },
                      {
                        label: copied ? '✓ Copied' : '📋 Copy',
                        onClick: copyScript,
                        disabled: !post.script,
                      },
                      {
                        label: '⬇ Save',
                        onClick: downloadScript,
                        disabled: !post.script,
                      },
                    ] as const
                  ).map(btn => (
                    <button
                      key={btn.label}
                      onClick={btn.onClick}
                      disabled={btn.disabled as boolean}
                      className="flex flex-1 cursor-pointer items-center justify-center rounded-[12px] border-[1.5px] border-border bg-white py-[10px] text-[11.5px] font-semibold text-navy transition-colors hover:border-[#8b93a1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* Reject link */}
                <button
                  onClick={reject}
                  disabled={busy}
                  className="w-full cursor-pointer border-0 bg-transparent py-[6px] text-[12.5px] font-semibold text-[#c2415c] hover:underline disabled:opacity-50"
                >
                  Not this one
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Regenerate confirmation ── */}
      {showRegenConfirm && (
        <Modal
          title="Regenerate script?"
          actions={
            <>
              <button
                onClick={() => setShowRegenConfirm(false)}
                className="cursor-pointer rounded-[10px] border border-border bg-white px-4 py-2 text-[13px] font-semibold text-muted transition-colors hover:border-[#8b93a1]"
              >
                Keep current
              </button>
              <Button onClick={regenerate} disabled={busy}>🔄 Regenerate</Button>
            </>
          }
        >
          <p className="m-0 text-[13.5px] leading-relaxed">
            The current script will be replaced with a fresh version. This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  )
}
