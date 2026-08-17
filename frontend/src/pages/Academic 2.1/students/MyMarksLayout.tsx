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
      {/* Sub-navigation: brand label + tab switcher */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {showBack ? (
            <div className="flex h-11 items-center">
              <button
                type="button"
                onClick={() => navigate('/academic-v2/student/courses')}
                className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>My Courses</span>
              </button>
            </div>
          ) : (
            <>
              {/* Brand label — desktop only */}
              <div className="hidden h-7 items-center sm:flex">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Academic 2.1 — My Marks</span>
              </div>
              {/* Full-width underline tabs — all sizes */}
              <div className="flex">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = tab.key === activeTab;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => navigate(tab.to)}
                      className={`flex flex-1 sm:flex-none sm:min-w-[130px] items-center justify-center sm:justify-start gap-2 py-3 sm:py-3.5 text-sm font-semibold transition-all border-b-2 sm:mr-2 ${
                        active
                          ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 sm:bg-transparent'
                          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-gray-400'}`} />
                      {tab.label}
                      {active && (
                        <span className="ml-1 hidden rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 sm:inline">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
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
