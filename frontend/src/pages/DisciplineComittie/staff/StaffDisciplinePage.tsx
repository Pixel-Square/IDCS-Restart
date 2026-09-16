import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  Camera,
  ClipboardList,
  Sparkles,
  QrCode,
  FileCheck
} from 'lucide-react';
import StaffScannerPage from './StaffScannerPage';
import StaffLogsPage from './StaffLogsPage';
import StaffApprovalsPage from './StaffApprovalsPage';

export type StaffDisciplineTab = 'scanner' | 'logs' | 'approvals';

export default function StaffDisciplinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as StaffDisciplineTab) || 'scanner';

  const handleTabChange = (tab: StaffDisciplineTab) => {
    setSearchParams({ tab });
  };

  const tabs = [
    {
      id: 'scanner' as StaffDisciplineTab,
      label: 'Live Scanner',
      description: 'Auto-starting barcode scanner & incident recorder',
      icon: Camera,
      badge: 'Active Scan',
    },
    {
      id: 'logs' as StaffDisciplineTab,
      label: 'Discipline Logs',
      description: 'Incident logs & recorded details',
      icon: ClipboardList,
      badge: 'History',
    },
    {
      id: 'approvals' as StaffDisciplineTab,
      label: 'Approvals',
      description: 'Review fine requests, receipts & approval workflow',
      icon: FileCheck,
      badge: 'Actionable',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── TOP NAVIGATION BAR FOR STAFF DISCIPLINE ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Branding */}
          <div className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-violet-600 text-white rounded-xl shadow-sm shadow-indigo-200">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    Discipline
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-full uppercase tracking-wider">
                    Staff & Approvals Portal
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live barcode scanner for student lookups, recorded discipline logs, and workflow approvals.
                </p>
              </div>
            </div>
          </div>

          {/* Top Tabs Bar */}
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-2.5 scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-[0.98] cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200 border border-indigo-600'
                      : 'bg-slate-50/80 hover:bg-slate-100 text-slate-600 border border-slate-200/80 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-md uppercase font-semibold ${
                      isActive
                        ? 'bg-indigo-700/80 text-white'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── TAB CONTENT ── */}
      <main className="flex-1 p-6 sm:p-8">
        {currentTab === 'scanner' && (
          <StaffScannerPage onIncidentLogged={() => handleTabChange('logs')} />
        )}
        {currentTab === 'logs' && <StaffLogsPage />}
        {currentTab === 'approvals' && <StaffApprovalsPage />}
      </main>
    </div>
  );
}

