'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import Button from '../components/Button'
import { Input } from '../components/Input'

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-[18px] h-[18px]">
        <path d="M10 2a5 5 0 0 0-3.5 8.6c.5.5.8 1 .8 1.6V13h5.4v-.8c0-.6.3-1.1.8-1.6A5 5 0 0 0 10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M7.5 15.5h5M8.5 17.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    title: 'Smart Topic Suggestions',
    desc: 'AI picks 3 ready-to-go topics daily, one from each of your content pillars',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-[18px] h-[18px]">
        <path d="M10 1l1.8 5.4H17l-4.5 3.3 1.7 5.3L10 12l-4.2 3 1.7-5.3L3 6.4h5.2L10 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
    title: 'AI Content Generation',
    desc: 'Caption, hashtags and image — built, brand-checked and ready to approve',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-[18px] h-[18px]">
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M6 8h4M8 6v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
    title: 'Competitor Intelligence',
    desc: 'Track competitor accounts and surface trending topics before you miss them',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-[18px] h-[18px]">
        <path d="M2 15l4.5-5 3.5 3 4-5.5L18 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 18h16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
      </svg>
    ),
    title: 'Performance Insights',
    desc: 'Know what content works and let the AI auto-adjust your strategy over time',
  },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1fr_1fr]">

      {/* ── Left panel — desktop only ─────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-[#0f172a] via-[#162d50] to-accent-700 px-14 py-14 relative overflow-hidden">

        {/* Ambient orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-[440px] h-[440px] rounded-full bg-accent/25 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-[340px] h-[340px] rounded-full bg-white/5 blur-3xl" />
        </div>

        {/* Top: logo + headline */}
        <div className="relative">
          <div className=" mb-10">
            <Logo height={36} />
          </div>
          <h2 className="text-white text-[1.85rem] font-semibold leading-[1.22] tracking-tight mb-4">
            AI Content Operating System
            <br />
            <span className="text-white/50 font-normal text-[1.45rem]">for Exam Educators</span>
          </h2>
          <p className="text-white/60 text-[0.9rem] leading-relaxed max-w-[340px]">
            Two taps a day. Pick a topic, approve the post — your Instagram runs on autopilot while you focus on teaching.
          </p>
        </div>

        {/* Middle: feature list */}
        <div className="relative flex flex-col gap-6 my-12">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/[0.08] flex items-center justify-center text-accent-50 flex-shrink-0 mt-0.5">
                {f.icon}
              </div>
              <div>
                <p className="text-white text-[0.875rem] font-semibold leading-snug mb-[3px]">{f.title}</p>
                <p className="text-white/50 text-[0.8rem] leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom: trust line */}
        <p className="relative text-white/28 text-[0.75rem] tracking-wide">
          Built for coaching institutes &amp; educators · India
        </p>
      </div>

      {/* ── Right panel: login form ───────────────────────────────── */}
      <div className="grid place-items-center min-h-screen lg:min-h-0 p-4 lg:p-10 bg-bg">
        <div className="w-[340px] lg:w-full lg:max-w-[400px]">

          {/* Desktop header — above the card */}
          <div className="hidden lg:block mb-7">
            <p className="text-[0.72rem] font-semibold tracking-[0.18em] text-muted uppercase mb-3">
              Owner Portal
            </p>
            <h1 className="text-[1.75rem] font-semibold text-text leading-tight tracking-tight">
              Welcome back
            </h1>
            <p className="text-muted text-[0.9rem] mt-1.5">Sign in to your dashboard</p>
          </div>

          <form
            className="bg-white border border-border rounded-3xl p-8 shadow-[0_12px_40px_rgba(15,23,42,0.08)]"
            onSubmit={submit}
          >
            {/* Mobile: logo + subtitle — unchanged from current */}
            <div className="mb-3 lg:hidden">
              <Logo height={40} />
            </div>
            <p className="text-muted text-[0.88rem] lg:hidden">Owner dashboard</p>

            <label className="block mt-3 mb-1 text-muted text-[0.85rem]">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className="block mt-3 mb-1 text-muted text-[0.85rem]">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-bad my-2">{error}</p>}
            <p>
              <Button type="submit" disabled={busy} className="w-full mt-2">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </p>
          </form>
        </div>
      </div>

    </div>
  )
}
