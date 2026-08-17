/**
 * CourseManagerDashboard — 3-section layout:
 * 1. Dashboard overview
 * 2. Course Grid (CourseManagerPage)
 * 3. Bypass Logs
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, BookOpen, Clock, ShieldAlert } from 'lucide-react';
import CourseManagerPage from './CourseManagerPage';
import BypassLogsPage from './BypassLogsPage';

type Section = 'dashboard' | 'courses' | 'logs';

export default function CourseManagerDashboard() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>('courses');

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r shadow-sm flex flex-col shrink-0">
        <div className="p-4 border-b">
          <button
            onClick={() => navigate('/academic-v2/admin')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin
          </button>
          <div className="mt-3 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <span className="font-semibold text-gray-900 text-sm">Course Manager</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <SidebarItem
            icon={<LayoutDashboard className="w-4 h-4" />}
            label="Overview"
            active={activeSection === 'dashboard'}
            onClick={() => setActiveSection('dashboard')}
          />
          <SidebarItem
            icon={<BookOpen className="w-4 h-4" />}
            label="Course Grid"
            active={activeSection === 'courses'}
            onClick={() => setActiveSection('courses')}
          />
          <SidebarItem
            icon={<Clock className="w-4 h-4" />}
            label="Bypass Logs"
            active={activeSection === 'logs'}
            onClick={() => setActiveSection('logs')}
          />
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {activeSection === 'dashboard' && <OverviewSection onNavigate={setActiveSection} />}
        {activeSection === 'courses' && <CourseManagerPageInline />}
        {activeSection === 'logs' && <BypassLogsPageInline />}
      </main>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function OverviewSection({ onNavigate }: { onNavigate: (s: Section) => void }) {
  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Course Manager Overview</h2>
      <p className="text-sm text-gray-500 mb-8">
        Use Course Manager to browse all Academic 2.1 courses, enter bypass mode for any faculty's marks,
        and review the complete audit trail of all bypass activity.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <OverviewCard
          icon={<BookOpen className="w-6 h-6 text-blue-600" />}
          title="Course Grid"
          description="Browse all courses and enter bypass mode for specific faculty sections."
          action="Open Courses"
          onClick={() => onNavigate('courses')}
        />
        <OverviewCard
          icon={<Clock className="w-6 h-6 text-amber-600" />}
          title="Bypass Logs"
          description="Full audit trail of all bypass sessions, resets, messages, and shared links."
          action="View Logs"
          onClick={() => onNavigate('logs')}
        />
        <OverviewCard
          icon={<ShieldAlert className="w-6 h-6 text-red-600" />}
          title="Admin Bypass"
          description="Click any course → Select faculty → Enter Bypass to access mark entry without restrictions."
          action="Browse Courses"
          onClick={() => onNavigate('courses')}
        />
      </div>
    </div>
  );
}

function OverviewCard({
  icon, title, description, action, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-3">
      <div className="p-2 bg-gray-50 rounded-lg w-fit">{icon}</div>
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
      <button
        onClick={onClick}
        className="mt-auto text-xs text-blue-600 hover:underline text-left"
      >
        {action} →
      </button>
    </div>
  );
}

// Inline wrappers (no separate navigation)
function CourseManagerPageInline() {
  const navigate = useNavigate();
  // Reuse CourseManagerPage but without the back button header
  return <CourseManagerPage />;
}

function BypassLogsPageInline() {
  return <BypassLogsPage />;
}
