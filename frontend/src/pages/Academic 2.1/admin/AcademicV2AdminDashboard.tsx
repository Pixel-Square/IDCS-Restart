/**
 * Academic 2.1 Admin Dashboard (Academic Controller)
 * Central hub showing all admin configuration pages in grid layout
 * Scoped to a specific Version (e.g. SEPT2026) with mapped Academic Years.
 */

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Lock,
  FileText,
  CheckCircle,
  BarChart2,
  Grid3x3,
  Settings,
  ShieldAlert,
  FileSpreadsheet,
  FileArchive,
  Layers,
  ChevronLeft,
  Calendar,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface AdminPage {
  title: string;
  path: string;
  description: string;
  icon: React.ReactNode;
  order: number;
}

const adminPages: AdminPage[] = [
  {
    title: 'Exam Management',
    path: '/academic-v2/admin/exam-management',
    description: 'Manage academic cycles, exam assignments, and class types for this version',
    icon: <Grid3x3 size={32} />,
    order: 1,
  },
  {
    title: 'Export/Import Manager',
    path: '/academic-v2/admin/export-import-manager',
    description: 'Configure groups, filter semesters, export ZIP course Excel templates, and import bulk mark entries',
    icon: <FileArchive size={32} />,
    order: 2,
  },
  {
    title: 'QP Patterns',
    path: '/academic-v2/admin/qp-patterns',
    description: 'Create and edit question paper patterns specific to this version',
    icon: <FileText size={32} />,
    order: 4,
  },
  {
    title: 'Weightage',
    path: '/academic-v2/admin/weightage',
    description: 'Set CO weight distributions for assigned exams by QP type',
    icon: <Grid3x3 size={32} />,
    order: 5,
  },
  {
    title: 'CO Attainment',
    path: '/academic-v2/admin/co-attainment-config',
    description: 'Configure CO attainment columns and related settings for courses',
    icon: <BarChart2 size={32} />,
    order: 6,
  },
  {
    title: 'Approval Inbox',
    path: '/academic-v2/admin/approvals',
    description: 'Review edit requests from faculty',
    icon: <CheckCircle size={32} />,
    order: 7,
  },
  {
    title: 'Publish Control',
    path: '/academic-v2/admin/publish-control',
    description: 'Configure semester due dates and publish settings',
    icon: <Lock size={32} />,
    order: 7,
  },
  {
    title: 'Settings',
    path: '/academic-v2/admin/pass-mark',
    description: 'System-wide configuration — pass mark thresholds and more',
    icon: <Settings size={32} />,
    order: 8,
  },
  {
    title: 'Google Sheets',
    path: '/academic-v2/admin/google-sheets',
    description: 'Configure Google Sheets credentials and manage course sheet links for mark-entry workflows',
    icon: <FileSpreadsheet size={32} />,
    order: 9,
  },
  {
    title: 'Internal Marks',
    path: '/academic-v2/admin/internal-marks',
    description: 'View and monitor internal marks across departments',
    icon: <BarChart2 size={32} />,
    order: 9,
  },
  {
    title: 'Course Manager',
    path: '/academic-v2/admin/course-manager',
    description: 'Browse all courses, faculty assignments, and bypass mark entry restrictions',
    icon: <ShieldAlert size={32} />,
    order: 10,
  },
];

interface VersionInfo {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  academic_years: {
    id: number;
    name: string;
    parity: string;
    is_active: boolean;
  }[];
  class_types_count: number;
  qp_patterns_count: number;
  cycles_count: number;
}

export default function AcademicV2AdminDashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const versionIdParam = searchParams.get('version_id');

  const [activeVersion, setActiveVersion] = useState<VersionInfo | null>(null);
  const [loadingVersion, setLoadingVersion] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchVersionContext() {
      setLoadingVersion(true);
      try {
        const res = await fetchWithAuth('/api/academic-v2/versions/');
        if (!res.ok) throw new Error('Failed to load versions');
        const data = await res.json();
        const list: VersionInfo[] = Array.isArray(data) ? data : data.results || [];

        if (list.length > 0 && isMounted) {
          let matched: VersionInfo | undefined;
          if (versionIdParam) {
            matched = list.find((v) => v.id === versionIdParam || v.name.toLowerCase() === versionIdParam.toLowerCase());
          }
          if (!matched) {
            matched = list.find((v) => v.is_default) || list[0];
          }
          setActiveVersion(matched || null);
        }
      } catch (err) {
        console.error('Failed to load version context:', err);
      } finally {
        if (isMounted) setLoadingVersion(false);
      }
    }

    fetchVersionContext();
    return () => {
      isMounted = false;
    };
  }, [versionIdParam]);

  const sortedPages = [...adminPages].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Top Breadcrumb & Switch Version Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/academic-v2/admin')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition shadow-sm"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
              Switch Version
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-medium text-slate-500">Academic Controller</span>
          </div>

          {activeVersion && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 font-semibold shadow-sm">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Active Context: <span className="font-mono">{activeVersion.name}</span>
              {activeVersion.is_default && (
                <span className="px-1.5 py-0.2 text-[10px] bg-emerald-100 text-emerald-800 rounded font-bold">
                  DEFAULT
                </span>
              )}
            </div>
          )}
        </div>

        {/* Version Scoped Header Banner */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-200">
                  <Layers className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                      Academic Controller
                    </h1>
                    {activeVersion && (
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-800 font-mono font-bold text-sm rounded-lg border border-indigo-200">
                        {activeVersion.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    Manage configurations, cycles, question paper patterns, and class types for this pattern version.
                  </p>
                </div>
              </div>

              {/* Mapped Academic Years */}
              {activeVersion && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Mapped Academic Years:
                  </span>
                  {activeVersion.academic_years.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No academic years mapped</span>
                  ) : (
                    activeVersion.academic_years.map((ay) => (
                      <span
                        key={ay.id}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium border ${
                          ay.is_active
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        {ay.name} ({ay.parity}) {ay.is_active && '• Current'}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Quick Stats Pill */}
            {activeVersion && (
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-center shrink-0">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Class Types</div>
                  <div className="text-lg font-extrabold text-slate-800 mt-0.5">
                    {activeVersion.class_types_count}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">QP Patterns</div>
                  <div className="text-lg font-extrabold text-slate-800 mt-0.5">
                    {activeVersion.qp_patterns_count}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Cycles</div>
                  <div className="text-lg font-extrabold text-slate-800 mt-0.5">
                    {activeVersion.cycles_count}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grid of Admin Pages */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedPages.map((page) => {
            const pageUrl = activeVersion ? `${page.path}?version_id=${activeVersion.id}` : page.path;
            return (
              <Link
                key={page.path}
                to={pageUrl}
                className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 hover:-translate-y-1 overflow-hidden border border-slate-200 flex flex-col justify-between"
              >
                {/* Top decorative gradient bar */}
                <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600" />

                <div className="p-6">
                  {/* Icon and Order Badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
                      {page.icon}
                    </div>
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-500 font-semibold text-xs">
                      {page.order}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition mb-2">
                    {page.title}
                  </h3>

                  {/* Description */}
                  <p className="text-slate-500 text-sm leading-relaxed mb-4">
                    {page.description}
                  </p>
                </div>

                {/* Card Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600 group-hover:text-indigo-700">
                  <span>Open Configuration</span>
                  <span className="group-hover:translate-x-1.5 transition-transform duration-200">
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Information Banner */}
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-6">
          <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" /> Version Configuration Tips
          </h3>
          <ul className="space-y-1.5 text-indigo-800 text-xs sm:text-sm">
            <li>
              • All Question Paper Patterns and Class Types defined in this controller are saved under version{' '}
              <strong>{activeVersion?.name || 'current'}</strong>.
            </li>
            <li>
              • Any academic years mapped to this version (current or historical) automatically enforce these QP patterns and cycle settings.
            </li>
            <li>
              • To create a new revision or update past patterns independently, return to{' '}
              <button
                onClick={() => navigate('/academic-v2/admin')}
                className="underline font-semibold hover:text-indigo-950"
              >
                Version Management
              </button>{' '}
              and create or clone a version.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
