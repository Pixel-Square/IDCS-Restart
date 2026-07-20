/**
 * Exam Management Page
 * Combines Cycle Management, Exam Assignment, and Class Types
 * into a single page with horizontal tab switching.
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCw, Grid3x3, BookOpen, ListTree } from 'lucide-react';
import CycleManagementPage from './CycleManagementPage';
import ExamAssignmentAdminPage from './ExamAssignmentAdminPage';
import ClassTypeEditorPage from './ClassTypeEditorPage';
import CourseOutcomePage from './CourseOutcomePage';

type TabKey = 'cycles' | 'exam-assignments' | 'class-types' | 'course-outcomes';

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  component: React.ReactNode;
}

const tabs: Tab[] = [
  {
    key: 'cycles',
    label: 'Cycle Management',
    icon: <RotateCw size={16} />,
    component: <CycleManagementPage />,
  },
  {
    key: 'exam-assignments',
    label: 'Exam Assignment',
    icon: <Grid3x3 size={16} />,
    component: <ExamAssignmentAdminPage />,
  },
  {
    key: 'class-types',
    label: 'Class Types',
    icon: <BookOpen size={16} />,
    component: <ClassTypeEditorPage />,
  },
  {
    key: 'course-outcomes',
    label: 'Course Outcome',
    icon: <ListTree size={16} />,
    component: <CourseOutcomePage />,
  },
];

export default function ExamManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get('tab');
  const activeTab: TabKey = queryTab === 'exam-assignments' || queryTab === 'class-types' || queryTab === 'course-outcomes' || queryTab === 'cycles'
    ? queryTab
    : 'cycles';

  const activeTabData = tabs.find((t) => t.key === activeTab)!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Exam Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage academic cycles, exam assignments, class types, and course outcomes
        </p>
      </div>

      {/* Horizontal Tab Bar */}
      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => setSearchParams({ tab: tab.key })}
                className={`
                  flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                  ${
                    isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div key={activeTab}>
        {activeTabData.component}
      </div>
    </div>
  );
}
