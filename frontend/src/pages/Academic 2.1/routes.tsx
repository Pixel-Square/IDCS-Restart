/**
 * Academic 2.1 - Routes Configuration
 * Define routes for the Academic 2.1 module
 */

import React from 'react';
import { RouteObject } from 'react-router-dom';

// Lazy load pages for code splitting
const AcademicV2AdminDashboard = React.lazy(() => import('./admin/AcademicV2AdminDashboard'));
const PublishControlPage = React.lazy(() => import('./admin/PublishControlPage'));
const ExamManagementPage = React.lazy(() => import('./admin/ExamManagementPage'));
const QpPatternEditorPage = React.lazy(() => import('./admin/QpPatternEditorPage'));
const ExamAssignmentAdminPage = React.lazy(() => import('./admin/ExamAssignmentAdminPage'));
const ApprovalInboxPage = React.lazy(() => import('./admin/ApprovalInboxPage'));
const InternalMarkAdminPage = React.lazy(() => import('./admin/InternalMarkAdminPage'));
const PassMarkSettingsPage = React.lazy(() => import('./admin/SettingsPage'));
const GoogleSheetsPage = React.lazy(() => import('./admin/GoogleSheetsPage'));
const CoAttainmentConfigPage = React.lazy(() => import('./admin/coattainment/CoAttainmentConfig'));
const ExportImportManagerPage = React.lazy(() => import('./admin/export_import/ExportImportManagerPage'));
const CourseListPage = React.lazy(() => import('./faculty/CourseListPage'));
const MarkEntryPage = React.lazy(() => import('./faculty/MarkEntryPage'));
const InternalMarkPage = React.lazy(() => import('./faculty/InternalMarkPage'));
// Bypass / Course Manager
const CourseManagerPage = React.lazy(() => import('./admin/CourseManagerPage'));
const CourseFacultyPage = React.lazy(() => import('./admin/CourseFacultyPage'));
const AdminBypassCoursePage = React.lazy(() => import('./admin/AdminBypassCoursePage'));
const BypassLogsPage = React.lazy(() => import('./admin/BypassLogsPage'));
const CourseManagerDashboard = React.lazy(() => import('./admin/CourseManagerDashboard'));
const StudentDashboardPage = React.lazy(() => import('./students/DashboardPage'));
const StudentCourseListPage = React.lazy(() => import('./students/CourseListPage'));
const StudentCourseDetailPage = React.lazy(() => import('./students/CourseDetailPage'));
const LCAWorkflowPage = React.lazy(() => import('./faculty/LCAWorkflowPage'));

export const academicV2Routes: RouteObject[] = [
  // Admin Routes - Dashboard
  {
    path: 'academic-v2/admin',
    element: <AcademicV2AdminDashboard />,
  },
  {
    path: 'academic-v2/admin/export-import-manager',
    element: <ExportImportManagerPage />,
  },
  {
    path: 'academic-v2/admin/publish-control',
    element: <PublishControlPage />,
  },
  {
    path: 'academic-v2/admin/exam-management',
    element: <ExamManagementPage />,
  },
  {
    path: 'academic-v2/admin/qp-patterns',
    element: <QpPatternEditorPage />,
  },
  {
    path: 'academic-v2/admin/approvals',
    element: <ApprovalInboxPage />,
  },
  {
    path: 'academic-v2/admin/internal-marks',
    element: <InternalMarkAdminPage />,
  },
  {
    path: 'academic-v2/admin/pass-mark',
    element: <PassMarkSettingsPage />,
  },
  {
    path: 'academic-v2/admin/google-sheets',
    element: <GoogleSheetsPage />,
  },
  {
    path: 'academic-v2/admin/co-attainment-config',
    element: <CoAttainmentConfigPage />,
  },
  // Course Manager + Bypass
  {
    path: 'academic-v2/admin/course-manager',
    element: <CourseManagerDashboard />,
  },
  {
    path: 'academic-v2/admin/course-manager/courses',
    element: <CourseManagerPage />,
  },
  {
    path: 'academic-v2/admin/course-manager/:taId/faculty',
    element: <CourseFacultyPage />,
  },
  {
    path: 'academic-v2/admin/bypass/:sessionId/course/:courseId',
    element: <AdminBypassCoursePage />,
  },
  {
    path: 'academic-v2/admin/bypass/logs',
    element: <BypassLogsPage />,
  },
  
  // Faculty Routes
  {
    path: 'academic-v2/courses',
    element: <CourseListPage />,
  },
  {
    path: 'academic-v2/course/:courseId',
    element: <InternalMarkPage />,
  },
  {
    path: 'academic-v2/student/dashboard',
    element: <StudentDashboardPage />,
  },
  {
    path: 'academic-v2/student/courses',
    element: <StudentCourseListPage />,
  },
  {
    path: 'academic-v2/student/course/:courseId',
    element: <StudentCourseDetailPage />,
  },
  {
    path: 'academic-v2/exam/:examId',
    element: <MarkEntryPage />,
  },
  // LCA Workflow — accessible from course page
  {
    path: 'academic-v2/course/:courseId/lca',
    element: <LCAWorkflowPage />,
  },
];

// Navigation menu structure
export const academicV2Navigation = {
  admin: [
    {
      title: 'Dashboard',
      path: '/academic-v2/admin',
      description: 'View all admin modules and quick access',
    },
    {
      title: 'Publish Control',
      path: '/academic-v2/admin/publish-control',
      description: 'Configure semester due dates and publish settings',
    },
    {
      title: 'Exam Management',
      path: '/academic-v2/admin/exam-management',
      description: 'Manage cycles, exam assignments, and class types',
    },
    {
      title: 'QP Patterns',
      path: '/academic-v2/admin/qp-patterns',
      description: 'Create and edit question paper patterns',
    },
    {
      title: 'Exam Assignments',
      path: '/academic-v2/admin/exam-assignments',
      description: 'Create reusable exam templates with question table customization',
    },
    {
      title: 'Approval Inbox',
      path: '/academic-v2/admin/approvals',
      description: 'Review edit requests from faculty',
    },
    {
      title: 'Internal Marks',
      path: '/academic-v2/admin/internal-marks',
      description: 'View and monitor internal marks across all departments',
    },
  ],
  faculty: [
    {
      title: 'My Courses',
      path: '/academic-v2/courses',
      description: 'View and manage assigned courses',
    },
  ],
};

export default academicV2Routes;
