import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  ShieldCheck, 
  Settings2, 
  ClipboardList, 
  QrCode,
  Sparkles,
  Layers,
  GraduationCap
} from 'lucide-react';
import ConfigPage from './ConfigPage';
import LogsPage from './LogsPage';
import StudentsBarCode from './StudentsBarCode';

export type DCAdminTab = 'config' | 'logs' | 'barcode';

export default function DCAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as DCAdminTab) || 'config';

  const handleTabChange = (tab: DCAdminTab) => {
    setSearchParams({ tab });
  };

  const tabs = [
    {
      id: 'config' as DCAdminTab,
      label: 'Config Page',
      description: 'Incident categories & semester rules',
      icon: Settings2,
      badge: 'Rules',
    },
    {
      id: 'logs' as DCAdminTab,
      label: 'Logs Page',
      description: 'Incident reports & audit trail',
      icon: ClipboardList,
      badge: 'Audit',
    },
    {
      id: 'barcode' as DCAdminTab,
      label: 'Student Barcode',
      description: 'Student list & barcode generation',
      icon: QrCode,
      badge: 'Directory',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── TOP NAVIGATION BAR FOR DC ADMIN ── */}
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
                    DC ADMIN
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-full uppercase tracking-wider">
                    Discipline Committee
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comprehensive management suite for discipline rules, incident logs, and student barcodes.
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
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-[0.98] ${
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
      <main className="flex-1">
        {currentTab === 'config' && <ConfigPage />}
        {currentTab === 'logs' && <LogsPage />}
        {currentTab === 'barcode' && <StudentsBarCode />}
      </main>
    </div>
  );
}
