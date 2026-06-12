import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Today from './pages/Today'
import PostReview from './pages/PostReview'
import IdeaBox from './pages/IdeaBox'
import Queue from './pages/Queue'
import Settings from './pages/Settings'
import Calibration from './pages/Calibration'

function Shell() {
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setShowLogoutModal(false)
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">
          <img src="/logo.svg" alt="ExamBro" />
        </span>

        <nav>
          <NavLink to="/today">Today</NavLink>
          <NavLink to="/review">Review</NavLink>
          <NavLink to="/ideas">Ideas</NavLink>
          <NavLink to="/queue">Queue</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <NavLink to="/calibration">Calibration</NavLink>
        </nav>

        <button
          className="ghost"
          onClick={() => setShowLogoutModal(true)}
        >
          Sign out
        </button>
      </header>

      <main>
        <Outlet />
      </main>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Sign Out</h3>

            <p>Are you sure you want to sign out?</p>

            <div className="modal-actions">
              <button
                className="ghost"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>

              <button
                className="danger"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="center">Loading…</div>
  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/review" element={<PostReview />} />
        <Route path="/review/:postId" element={<PostReview />} />
        <Route path="/ideas" element={<IdeaBox />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/calibration" element={<Calibration />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
  )
}
