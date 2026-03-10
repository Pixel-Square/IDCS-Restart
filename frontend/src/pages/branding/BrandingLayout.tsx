import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import BrandingSidebar from './BrandingSidebar';
import BrandingProfilePage from './BrandingProfilePage';
import BrandingCreatePage from './BrandingCreatePage';
import BrandingEventApprovalPage from './BrandingEventApprovalPage';
import BrandingRecentsPage from './BrandingRecentsPage';
import TemplatesListPage from './templates/TemplatesListPage';
import TemplateEditorPage from './templates/TemplateEditorPage';
import CanvaOAuthCallbackPage from './templates/CanvaOAuthCallbackPage';

/**
 * Top-level layout for the Branding role.
 * Completely isolated from the main IDCS layout — no Navbar, no DashboardSidebar.
 */
export default function BrandingLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <BrandingSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

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
            <Route path="create"         element={<BrandingCreatePage />}        />
            <Route path="event-approval" element={<BrandingEventApprovalPage />} />
            <Route path="recents"          element={<BrandingRecentsPage />}       />
            <Route path="templates"        element={<TemplatesListPage />}          />
            <Route path="templates/editor" element={<TemplateEditorPage />}         />
            {/* Canva OAuth callback — must be inside BrandingLayout for the /branding/* guard */}
            <Route path="oauth-callback"   element={<CanvaOAuthCallbackPage />}        />
            <Route path="*"                element={<Navigate to="profile" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
