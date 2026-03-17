import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import BrandingSidebar from './BrandingSidebar';
import BrandingProfilePage from './BrandingProfilePage';
import BrandingRecentsPage from './BrandingRecentsPage';
import BrandingListPostersPage from './BrandingListPostersPage';
import PosterMakerPage from '../events/PosterMakerPage';
import TemplatesListPage from './templates/TemplatesListPage';
import TemplateEditorPage from './templates/TemplateEditorPage';
import CanvaOAuthCallbackPage from './templates/CanvaOAuthCallbackPage';

/**
 * Top-level layout for the Branding role.
 * Completely isolated from the main IDCS layout — no Navbar, no DashboardSidebar.
 */
interface Props {
  user: any;
}

export default function BrandingLayout({ user }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <BrandingSidebar user={user} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          collapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm h-16 flex items-center px-4 gap-3">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 ml-1">
            <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />
            <span className="text-sm font-semibold text-gray-700">Branding Dashboard</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-3 py-1 rounded-full">
              Branding
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          <Routes>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile"        element={<BrandingProfilePage />}       />
            <Route path="create"         element={<Navigate to="/branding/poster-maker" replace />} />
            <Route path="recents"          element={<BrandingRecentsPage />}       />
            <Route path="templates"        element={<TemplatesListPage />}          />
            <Route path="templates/editor" element={<TemplateEditorPage />}         />
            <Route path="oauth-callback"   element={<CanvaOAuthCallbackPage />}     />
            <Route path="poster-maker"     element={<PosterMakerPage embedded />}   />
            <Route
              path="list-posters"
              element={<ProtectedRoute user={user} requiredPermissions={["branding.list_posters"]} element={<BrandingListPostersPage />} />}
            />

            {/* Event Approval UI removed: show a 404-style screen for legacy URLs */}
            <Route
              path="event-approval/*"
              element={(
                <div className="min-h-[60vh] flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-gray-500">404</div>
                    <h2 className="text-2xl font-bold text-gray-800 mt-2">Page not found</h2>
                    <p className="text-sm text-gray-600 mt-2">This page is no longer available.</p>
                  </div>
                </div>
              )}
            />

            <Route path="*"                element={<Navigate to="profile" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
