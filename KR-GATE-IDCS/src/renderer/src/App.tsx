import React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import SplashPage from './pages/SplashPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import WelcomePage from './pages/WelcomePage'
import GateScanPage from './pages/GateScanPage'
import GateLogsPage from './pages/GateLogsPage'
import OfflineRecordsPage from './pages/OfflineRecordsPage'
import { AuthProvider, useAuth } from './state/auth'
import { ConnectivityProvider } from './state/connectivity'
import { ScannerProvider } from './state/scanner'

function Protected({ children }: { children: React.ReactNode }) {
  const { me } = useAuth()
  const loc = useLocation()
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <ConnectivityProvider>
        <ScannerProvider>
          <Routes>
            <Route path="/" element={<SplashPage />} />
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/dashboard"
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
            <Route
              path="/welcome"
              element={
                <Protected>
                  <WelcomePage />
                </Protected>
              }
            />
            <Route
              path="/gatescan"
              element={
                <Protected>
                  <GateScanPage />
                </Protected>
              }
            />
            <Route
              path="/gatelogs"
              element={
                <Protected>
                  <GateLogsPage />
                </Protected>
              }
            />
            <Route
              path="/offline-records"
              element={
                <Protected>
                  <OfflineRecordsPage />
                </Protected>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ScannerProvider>
      </ConnectivityProvider>
    </AuthProvider>
  )
}
