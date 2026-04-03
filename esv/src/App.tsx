import React from 'react';
import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import CodeEntryPage from './pages/CodeEntryPage';
import MarkEntryPage from './pages/MarkEntryPage';
import ProfilePage from './pages/ProfilePage';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const facultyCode = sessionStorage.getItem('esv-faculty-code');

  if (!facultyCode) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#fdfaf9]">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#ead7d0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              <Link
                to="/profile"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                  location.pathname === '/profile'
                    ? 'border-[#6f1d34] text-[#6f1d34]'
                    : 'border-transparent text-[#6f4a3f] hover:text-[#6f1d34]'
                }`}
              >
                Profile
              </Link>
              <Link
                to="/mark-entry"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                  location.pathname === '/mark-entry'
                    ? 'border-[#6f1d34] text-[#6f1d34]'
                    : 'border-transparent text-[#6f4a3f] hover:text-[#6f1d34]'
                }`}
              >
                Mark Entry
              </Link>
            </div>
            <div className="flex items-center text-xs font-semibold text-[#6f1d34] bg-[#faf4f0] px-3 py-1 rounded-full border border-[#d9b7ac] my-auto h-fit">
              ID: {facultyCode}
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CodeEntryPage />} />
      <Route path="/profile" element={<Layout><ProfilePage /></Layout>} />
      <Route path="/mark-entry" element={<Layout><MarkEntryPage /></Layout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
