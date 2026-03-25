import React from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import ArrearList from './pages/COE/ArrearList';
import BarScan from './pages/COE/BarScan';
import BarScanMarkEntry from './pages/COE/BarScanMarkEntry';
import BundleAllocation from './pages/COE/BundleAllocation';
import BundleBarcodeView from './pages/COE/BundleBarcodeView';
import CoePortalPage from './pages/COE/CoePortalPage';
import CourseList from './pages/COE/CourseList';
import LoginPage from './pages/LoginPage';
import OnePageReport from './pages/COE/OnePageReport';
import RetrivalPage from './pages/COE/RetrivalPage';
import StudentsList from './pages/COE/StudentsList';

function hasAccessToken(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.localStorage.getItem('access'));
}

function readCachedUser(): { email?: string } | null {
  try {
    const raw = window.localStorage.getItem('me');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!hasAccessToken()) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const isAuthenticated = hasAccessToken();
  const links = [
    { to: '/coe', label: 'Portal' },
    { to: '/coe/courses', label: 'Courses' },
    { to: '/coe/students', label: 'Students' },
    { to: '/coe/arrears', label: 'Arrears' },
    { to: '/coe/bundle-allocation', label: 'Bundles' },
    { to: '/coe/bundle-barcodes', label: 'Bundle Barcodes' },
    { to: '/coe/bar-scan', label: 'Bar Scan' },
    { to: '/coe/one-page-report', label: 'One Page Report' },
    { to: '/coe/retrival', label: 'Retrival Logs' },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col gap-3">
          <div className="text-lg font-bold text-gray-900">COE Portal</div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {links.map((item) => (
              <Link
                key={item.to}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-blue-700 hover:bg-blue-100"
                to={item.to}
              >
                {item.label}
              </Link>
            ))}
            {!isAuthenticated ? (
              <Link
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700 hover:bg-emerald-100"
                to="/login"
              >
                Login
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}

function Home() {
  return (
    <div className="rounded-xl border bg-white p-6">
      <h1 className="text-xl font-bold text-gray-900">COE</h1>
      <p className="mt-2 text-sm text-gray-600">
        This standalone COE app now runs all COE pages, data APIs, and logs directly from this project.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/coe"
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Open COE Portal
        </Link>
        <Link
          to="/coe/one-page-report"
          className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Open One Page Report
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  const appUser = readCachedUser();
  const isAuthenticated = hasAccessToken();

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to={isAuthenticated ? '/coe' : '/login'} replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/coe" element={<RequireAuth><CoePortalPage user={appUser} /></RequireAuth>} />
        <Route path="/coe/students" element={<RequireAuth><StudentsList /></RequireAuth>} />
        <Route path="/coe/courses" element={<RequireAuth><CourseList /></RequireAuth>} />
        <Route path="/coe/arrears" element={<RequireAuth><ArrearList /></RequireAuth>} />
        <Route path="/coe/bundle-allocation" element={<RequireAuth><BundleAllocation /></RequireAuth>} />
        <Route path="/coe/bundle-barcodes" element={<RequireAuth><BundleBarcodeView /></RequireAuth>} />
        <Route path="/coe/bar-scan" element={<RequireAuth><BarScan /></RequireAuth>} />
        <Route path="/coe/bar-scan/entry" element={<RequireAuth><BarScanMarkEntry /></RequireAuth>} />
        <Route path="/coe/retrival" element={<RequireAuth><RetrivalPage /></RequireAuth>} />
        <Route path="/coe/one-page-report" element={<RequireAuth><OnePageReport /></RequireAuth>} />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/coe' : '/login'} replace />} />
      </Routes>
    </Shell>
  );
}
