/**
 * Academic 2.1 Admin Dashboard
 * Central hub showing all admin pages in grid layout
 */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Lock,
  RotateCw,
  BookOpen,
  FileText,
  CheckCircle,
  BarChart2,
  Grid3x3,
  Settings,
  ShieldAlert,
} from 'lucide-react';

interface AdminPage {
  title: string;
  path: string;
  description: string;
  icon: React.ReactNode;
  order: number;
}

const adminPages: AdminPage[] = [
  {
    title: 'Publish Control',
    path: '/academic-v2/admin/publish-control',
    description: 'Configure semester due dates and publish settings',
    icon: <Lock size={32} />,
    order: 1,
  },
  {
    title: 'Cycle Management',
    path: '/academic-v2/admin/cycles',
    description: 'Create and manage academic cycles',
    icon: <RotateCw size={32} />,
    order: 2,
  },
  {
    title: 'Class Types',
    path: '/academic-v2/admin/class-types',
    description: 'Manage class types and exam assignments',
    icon: <BookOpen size={32} />,
    order: 3,
  },
  {
    title: 'QP Patterns',
    path: '/academic-v2/admin/qp-patterns',
    description: 'Create and edit question paper patterns',
    icon: <FileText size={32} />,
    order: 4,
  },
  {
    title: 'Exam Assignments',
    path: '/academic-v2/admin/exam-assignments',
    description: 'Create reusable exam templates with question customization',
    icon: <Grid3x3 size={32} />,
    order: 5,
  },
  {
    title: 'Approval Inbox',
    path: '/academic-v2/admin/approvals',
    description: 'Review edit requests from faculty',
    icon: <CheckCircle size={32} />,
    order: 6,
  },
  {
    title: 'Internal Marks',
    path: '/academic-v2/admin/internal-marks',
    description: 'View and monitor internal marks across departments',
    icon: <BarChart2 size={32} />,
    order: 7,
  },
  {
    title: 'Weightage',
    path: '/academic-v2/admin/weightage',
    description: 'Set CO weight distributions for assigned exams by QP type',
    icon: <Grid3x3 size={32} />,
    order: 8,
  },
  {
    title: 'Settings',
    path: '/academic-v2/admin/pass-mark',
    description: 'System-wide configuration — pass mark thresholds and more',
    icon: <Settings size={32} />,
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

export default function AcademicV2AdminDashboard() {
  const sortedPages = [...adminPages].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Academic 2.1 Admin</h1>
          <p className="text-lg text-gray-600">
            Manage academic settings, cycles, class types, and question paper patterns
          </p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-600">
            <div className="text-sm text-gray-600 font-medium">Total Modules</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{sortedPages.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
            <div className="text-sm text-gray-600 font-medium">Admin Functions</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">7</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-600">
            <div className="text-sm text-gray-600 font-medium">Quick Access</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">⚡</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-600">
            <div className="text-sm text-gray-600 font-medium">Status</div>
            <div className="text-lg font-bold text-green-600 mt-2">Ready</div>
          </div>
        </div>

        {/* Grid of Admin Pages */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedPages.map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className="group bg-white rounded-lg shadow hover:shadow-lg transition-all hover:-translate-y-1 overflow-hidden"
            >
              {/* Card Header - Order Badge */}
              <div className="h-1 bg-gradient-to-r from-blue-600 to-blue-400" />

              <div className="p-6">
                {/* Icon and Title */}
                <div className="flex items-start justify-between mb-4">
                  <div className="text-blue-600 group-hover:text-blue-700 transition">
                    {page.icon}
                  </div>
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm">
                    {page.order}
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition mb-2">
                  {page.title}
                </h3>

                {/* Description */}
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  {page.description}
                </p>

                {/* Footer */}
                <div className="flex items-center text-blue-600 font-medium text-sm group-hover:gap-2 transition-all">
                  Go to Page
                  <span className="ml-1 group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>

              {/* Bottom accent */}
              <div className="h-1 bg-gradient-to-r from-gray-200 to-gray-100" />
            </Link>
          ))}
        </div>

        {/* Quick Tips */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">💡 Quick Tips</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li>
              • Start with <strong>Publish Control</strong> to set up semester dates and publish settings
            </li>
            <li>
              • Use <strong>Cycle Management</strong> to create and manage academic cycles
            </li>
            <li>
              • Define <strong>Class Types</strong> before creating exam assignments
            </li>
            <li>
              • Build <strong>QP Patterns</strong> as reusable question paper templates
            </li>
            <li>
              • Use <strong>Exam Assignments</strong> to create exam instances with question customization
            </li>
            <li>
              • Monitor <strong>Approval Inbox</strong> for pending faculty requests
            </li>
            <li>
              • Track <strong>Internal Marks</strong> across all departments in real-time
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
