import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import SplashPage from './pages/SplashPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ApplyPage from './pages/ApplyPage'
import ApplicationFormPage from './pages/ApplicationFormPage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
import HistoryPage from './pages/HistoryPage'
import ProfilePage from './pages/ProfilePage'
import ApprovalsPage from './pages/ApprovalsPage'
import { Shell } from './components/Shell'
import { getCachedMe, getMe, type GateUser } from './services/auth'
import { fetchApplicationsNav } from './services/applications'

function AppRoutes(): JSX.Element {
  const [user, setUser] = useState<GateUser | null>(getCachedMe())
  const [loading, setLoading] = useState(true)
  const [canReview, setCanReview] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const token = localStorage.getItem('access') || localStorage.getItem('gate_access')
      if (!token) {
        if (mounted) setLoading(false)
        return
      }

      try {
        const me = await getMe()
        if (mounted) setUser(me)
        const nav = await fetchApplicationsNav().catch(() => null)
        if (mounted) setCanReview(Boolean(nav?.show_applications))
      } catch {
        if (mounted) setUser(null)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const shell = useMemo(() => (children: JSX.Element) => <Shell user={user}>{children}</Shell>, [user])

  if (loading) return <SplashPage />

  return (
    <Routes>
      <Route path="/" element={<SplashPage />} />
      <Route path="/login" element={<LoginPage onLoggedIn={setUser} />} />
      <Route path="/dashboard" element={user ? shell(<DashboardPage />) : <Navigate to="/login" replace />} />
      <Route path="/apply" element={user ? shell(<ApplyPage />) : <Navigate to="/login" replace />} />
      <Route path="/apply/new/:typeId" element={user ? shell(<ApplicationFormPage />) : <Navigate to="/login" replace />} />
      <Route path="/applications/:id" element={user ? shell(<ApplicationDetailPage />) : <Navigate to="/login" replace />} />
      <Route path="/history" element={user ? shell(<HistoryPage />) : <Navigate to="/login" replace />} />
      <Route path="/profile" element={user ? shell(<ProfilePage />) : <Navigate to="/login" replace />} />
      <Route path="/approvals" element={user ? (canReview ? shell(<ApprovalsPage />) : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  )
}
