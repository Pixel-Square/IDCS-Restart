import React from 'react';
import { BarChart3, BookOpen, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MyMarksLayoutProps {
  activeTab: 'dashboard' | 'courses';
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  showBack?: boolean;
}

export default function MyMarksLayout({
  activeTab,
  title,
  subtitle,
  children,
  showBack = false,
}: MyMarksLayoutProps) {
  const navigate = useNavigate();

  const tabs = [
    { key: 'dashboard' as const, label: 'Dashboard', to: '/academic-v2/student/dashboard', icon: BarChart3 },
    { key: 'courses' as const, label: 'My Courses', to: '/academic-v2/student/courses', icon: BookOpen },
  ];

  return (
    <div>
      {/* Sub-navigation bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-11 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {showBack ? (
            <button
              type="button"
              onClick={() => navigate('/academic-v2/student/courses')}
              className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>My Courses</span>
            </button>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Academic 2.1 — My Marks</span>
          )}
          {!showBack && (
            <nav className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => navigate(tab.to)}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                      active
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Page header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Page content */}
      <div className="min-h-[calc(100vh-10rem)] bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
