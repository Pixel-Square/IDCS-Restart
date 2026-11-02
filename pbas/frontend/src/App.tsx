import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import WelcomePage from './pages/WelcomePage'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './components/layout/DashboardLayout'
import DashboardHome from './pages/DashboardHome'
import PBASSubmissionPage from './pages/PBASSubmissionPage'
import MySubmissionsPage from './pages/MySubmissionsPage'
import PBASApprovalsPage from './pages/PBASApprovalsPage'
import PBASAdminPage from './pages/PBASAdminPage'
import ProfilePage from './pages/ProfilePage'
import { AuthUser } from './types/pbas'
import { getStoredToken, getStoredUser, fetchMe } from './services/auth'

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getStoredToken()
    if (token) {
      fetchMe()
        .then(setUser)
        .catch(() => {
          // If token expired/invalid, clear session
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const handleLoginSuccess = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser)
  }

  const handleUserSwitch = (switchedUser: AuthUser) => {
    setUser(switchedUser)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading PBAS Portal...</span>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Step 1: At first Welcome page */}
        <Route path="/" element={<WelcomePage />} />

        {/* Step 2: Then Login page */}
        <Route
          path="/login"
          element={<LoginPage onLoginSuccess={handleLoginSuccess} />}
        />

        {/* Step 3: Then the Dashboard with sidebars */}
        <Route
          path="/dashboard"
          element={
            user ? (
              <DashboardLayout user={user} onUserSwitch={handleUserSwitch} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<DashboardHome user={user} />} />
          <Route path="submit" element={<PBASSubmissionPage user={user} />} />
          <Route path="my-submissions" element={<MySubmissionsPage user={user} />} />
          <Route path="approvals" element={<PBASApprovalsPage user={user} />} />
          <Route path="admin" element={<PBASAdminPage user={user} />} />
          <Route path="profile" element={<ProfilePage user={user} />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
