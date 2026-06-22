'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import Button from '../components/Button'
import Modal from '../components/Modal'

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const NAV = [
  {
    href: '/today',
    label: 'Today',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-[20px] h-[20px] flex-shrink-0">
        <path d="M3 11l9-8 9 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 10v10h14V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/ideas',
    label: 'Ideas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-[20px] h-[20px] flex-shrink-0">
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.2 1 2V16h6v-.5c0-.8.4-1.4 1-2A6 6 0 0 0 12 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/queue',
    label: 'History',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-[20px] h-[20px] flex-shrink-0">
        <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/insights',
    label: 'Insights',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-[20px] h-[20px] flex-shrink-0">
        <path d="M3 21h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 21V12M12 21V6M17 21v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-[20px] h-[20px] flex-shrink-0">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.2-1.3L14 2h-4l-.4 2.4a7 7 0 0 0-2.2 1.3l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.2 1.3L10 22h4l.4-2.4a7 7 0 0 0 2.2-1.3l2.3.9 2-3.4-2-1.5A7 7 0 0 0 19 12z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function Shell({ children }: { children: ReactNode }) {
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const pathname = usePathname()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setShowLogoutModal(false)
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/today' && pathname?.startsWith(href + '/'))

  return (
    // Mobile: flex-col with page scroll / Desktop: h-screen flex-row with sidebar + scrollable main
    <div className="min-h-screen flex flex-col md:h-screen md:flex-row md:overflow-hidden bg-bg">

      {/* ── Mobile-only top bar ───────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 h-[52px] bg-white/92 backdrop-blur-md border-b border-border sticky top-0 z-[100] flex-shrink-0">
        <Logo height={28} />
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-semibold text-muted">{todayLabel()}</span>
          <Button variant="ghost" size="small" onClick={() => setShowLogoutModal(true)}>
            Sign out
          </Button>
        </div>
      </header>

      {/* ── Desktop sidebar ───────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-[300px] flex-shrink-0 h-full bg-white border-r border-border">

        {/* Logo */}
        <div className="px-5 pt-[26px] pb-6 flex-shrink-0">
          <Logo height={30} />
        </div>

        {/* Nav section label */}
        <p className="px-5 text-[10px] font-bold uppercase tracking-[.1em] text-muted mb-[6px] flex-shrink-0">
          Menu
        </p>

        {/* Nav links */}
        <nav className="px-3 flex flex-col gap-[4px] flex-1 min-h-0 overflow-y-auto">
          {NAV.map(({ href, label, icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex items-center gap-[11px] px-[10px] py-[11px] rounded-xs text-[13.5px] font-semibold transition-colors duration-150 no-underline',
                  active
                    ? 'bg-orange/[0.10] text-orange'
                    : 'text-muted hover:text-text hover:bg-bg',
                ].join(' ')}
              >
                {icon}
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom: date + sign out */}
        <div className="px-5 pb-6 pt-4 border-t border-border flex-shrink-0 mt-4">
          <p className="text-[11px] font-semibold text-muted mb-[14px]">{todayLabel()}</p>
          <button
            onClick={() => setShowLogoutModal(true)}
            className="flex items-center gap-[8px] text-[13px] font-semibold text-muted hover:text-bad cursor-pointer transition-colors w-full text-left border-0 bg-transparent p-0"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-[16px] h-[16px] flex-shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Content area ──────────────────────────────────────── */}
      {/*
        Mobile: overflows naturally (page scroll), padded for bottom nav
        Desktop: flex-1, independently scrollable, wider content, top padding
      */}
      <main className="flex-1 px-4 pt-5 pb-[88px] md:overflow-y-auto md:pb-12 md:px-10 md:pt-10">
        <div className="max-w-[560px] md:max-w-none mx-auto md:mx-0">
          {children}
        </div>
      </main>

      {/* ── Mobile-only bottom nav ────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] flex bg-white/[0.96] backdrop-blur-md border-t border-border safe-b">
        {NAV.map(({ href, label, icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors duration-150 no-underline',
                active ? 'text-orange' : 'text-muted',
              ].join(' ')}
            >
              {icon}
              <span className="text-[10.5px] font-semibold leading-none">{label}</span>
            </Link>
          )
        })}
      </nav>

      {showLogoutModal && (
        <Modal
          title="Sign Out"
          actions={
            <>
              <Button variant="ghost" onClick={() => setShowLogoutModal(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleSignOut}>Sign Out</Button>
            </>
          }
        >
          Are you sure you want to sign out?
        </Modal>
      )}
    </div>
  )
}
