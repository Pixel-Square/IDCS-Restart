import React, { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import ArrearList from './pages/COE/ArrearList';
import AssigningPage from './pages/COE/AssigningPage';
import AttendancePage from './pages/COE/AttendancePage';
import BarScan from './pages/COE/BarScan';
import BarScanMarkEntry from './pages/COE/BarScanMarkEntry';
import BundleAllocation from './pages/COE/BundleAllocation';
import BundleBarcodeView from './pages/COE/BundleBarcodeView';
import CoePortalPage from './pages/COE/CoePortalPage';
import CourseList from './pages/COE/CourseList';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import OnePageReport from './pages/COE/OnePageReport';
import ProfilePage from './pages/ProfilePage';
import QueriesPage from './pages/QueriesPage';
import RetrivalPage from './pages/COE/RetrivalPage';
import DataViewPage from './pages/DataViewPage';
import { logout } from './services/auth';
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
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const isAuthenticated = hasAccessToken();
  const isLoginPage = location.pathname === '/login';

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const topLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/profile', label: 'Profile' },
  ];

  const links = [
    { to: '/coe', label: 'Portal' },
    { to: '/coe/courses', label: 'Courses' },
    { to: '/coe/attendance', label: 'Attendance' },
    { to: '/coe/students', label: 'Students' },
    { to: '/coe/arrears', label: 'Arrears' },
    { to: '/coe/bundle-allocation', label: 'Bundles' },
    { to: '/coe/assigning', label: 'Assigning' },
    { to: '/coe/bar-scan', label: 'Bar Scan' },
    { to: '/coe/one-page-report', label: 'One Page Report' },
  ];

  const bottomLinks = [{ to: '/queries', label: 'Raise Token' }];

  function handleLogout() {
    logout();
    window.location.href = '/login';
  }

  if (isLoginPage) {
    return (
      <div className="coe-app-bg min-h-screen">
        <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="w-full">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="coe-app-bg min-h-screen">
      <div className="relative min-h-screen">
        <header className="sticky top-0 z-40 border-b border-[#c8917f]/40 bg-gradient-to-r from-[#6f1d34] via-[#7a2038] to-[#a3462d] px-4 py-3 text-white shadow-sm sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDesktopSidebarCollapsed && (
                <button
                  onClick={() => setIsDesktopSidebarCollapsed(false)}
                  className="hidden lg:flex items-center justify-center rounded-lg border border-white/40 bg-white/10 p-2 text-white hover:bg-white/20"
                  title="Expand Sidebar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
              )}
              <div>
                <p className="text-lg font-bold">COE Portal</p>
                <p className="text-xs text-white/80">Controller of Examinations Workspace</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20 lg:hidden"
                onClick={() => setIsSidebarOpen(true)}
              >
                Menu
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <aside
          className={`fixed bottom-0 left-0 top-[65px] z-30 w-72 transform border-r border-white/35 bg-gradient-to-b from-[#5f1730] via-[#7a2038] to-[#a3462d] p-5 text-white shadow-2xl transition-transform duration-200 ${
            isDesktopSidebarCollapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'
          } ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex h-full flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent hover:scrollbar-thumb-white/50">
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <span className="text-sm font-semibold text-white/70">Menu</span>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-lg p-1 hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4 hidden items-center justify-end lg:flex">
              <button
                onClick={() => setIsDesktopSidebarCollapsed(true)}
                className="rounded-lg p-1.5 hover:bg-white/10 text-white/70 hover:text-white"
                title="Collapse Sidebar"
              >
                ✕
              </button>
            </div>
            <nav className="space-y-2">
              {topLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? 'bg-white text-[#6f1d34] shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <nav className="mt-5 space-y-2">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-white text-[#6f1d34] shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {!isAuthenticated ? (
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-white text-[#6f1d34] shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
                  }`
                }
              >
                Login
              </NavLink>
            ) : null}
            </nav>

            <nav className="mt-auto space-y-2 border-t border-white/20 pt-4">
              {bottomLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? 'bg-white text-[#6f1d34] shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

        </aside>

        {isSidebarOpen ? (
          <button
            type="button"
            className="fixed bottom-0 left-0 right-0 top-[65px] z-20 bg-black/40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        ) : null}

        <div className={`relative z-10 min-h-[calc(100vh-65px)] transition-all duration-200 ${
          isDesktopSidebarCollapsed ? 'lg:pl-0' : 'lg:pl-72'
        }`}>
          <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className="rounded-2xl border border-[#d9b7ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
      <h1 className="text-xl font-bold text-[#5a192f]">COE</h1>
      <p className="mt-2 text-sm text-[#6f4a3f]">
        This standalone COE app now runs all COE pages, data APIs, and logs directly from this project.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/coe"
          className="inline-flex items-center rounded-lg bg-[#6f1d34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#591729]"
        >
          Open COE Portal
        </Link>
        <Link
          to="/coe/one-page-report"
          className="inline-flex items-center rounded-lg bg-[#b2472e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#913925]"
        >
          Open One Page Report
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthenticated = hasAccessToken();

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/data-view" element={<RequireAuth><DataViewPage /></RequireAuth>} />
        <Route path="/queries" element={<RequireAuth><QueriesPage /></RequireAuth>} />
        <Route path="/coe" element={<RequireAuth><CoePortalPage user={readCachedUser()} /></RequireAuth>} />
        <Route path="/coe/students" element={<RequireAuth><StudentsList /></RequireAuth>} />
        <Route path="/coe/courses" element={<RequireAuth><CourseList /></RequireAuth>} />
        <Route path="/coe/attendance" element={<RequireAuth><AttendancePage /></RequireAuth>} />
        <Route path="/coe/arrears" element={<RequireAuth><ArrearList /></RequireAuth>} />
        <Route path="/coe/bundle-allocation" element={<RequireAuth><BundleAllocation /></RequireAuth>} />
        <Route path="/coe/assigning" element={<RequireAuth><AssigningPage /></RequireAuth>} />
        <Route path="/coe/bundle-barcodes" element={<RequireAuth><BundleBarcodeView /></RequireAuth>} />
        <Route path="/coe/bar-scan" element={<RequireAuth><BarScan /></RequireAuth>} />
        <Route path="/coe/bar-scan/entry" element={<RequireAuth><BarScanMarkEntry /></RequireAuth>} />
        <Route path="/coe/retrival" element={<RequireAuth><RetrivalPage /></RequireAuth>} />
        <Route path="/coe/one-page-report" element={<RequireAuth><OnePageReport /></RequireAuth>} />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </Shell>
  );
}
