/**
 * Academic 2.1 - Routes Configuration
 * Define routes for the Academic 2.1 module
 */

import React from 'react';
import { RouteObject } from 'react-router-dom';

// Lazy load pages for code splitting
const AcademicV2AdminDashboard = React.lazy(() => import('./admin/AcademicV2AdminDashboard'));
const PublishControlPage = React.lazy(() => import('./admin/PublishControlPage'));
const CycleManagementPage = React.lazy(() => import('./admin/CycleManagementPage'));
const ClassTypeEditorPage = React.lazy(() => import('./admin/ClassTypeEditorPage'));
const QpPatternEditorPage = React.lazy(() => import('./admin/QpPatternEditorPage'));
const ExamAssignmentAdminPage = React.lazy(() => import('./admin/ExamAssignmentAdminPage'));
const ApprovalInboxPage = React.lazy(() => import('./admin/ApprovalInboxPage'));
const InternalMarkAdminPage = React.lazy(() => import('./admin/InternalMarkAdminPage'));
const CourseListPage = React.lazy(() => import('./faculty/CourseListPage'));
const MarkEntryPage = React.lazy(() => import('./faculty/MarkEntryPage'));
const InternalMarkPage = React.lazy(() => import('./faculty/InternalMarkPage'));

export const academicV2Routes: RouteObject[] = [
  // Admin Routes - Dashboard
  {
    path: 'academic-v2/admin',
    element: <AcademicV2AdminDashboard />,
  },
  {
    path: 'academic-v2/admin/publish-control',
    element: <PublishControlPage />,
  },
  {
    path: 'academic-v2/admin/cycles',
    element: <CycleManagementPage />,
  },
  {
    path: 'academic-v2/admin/class-types',
    element: <ClassTypeEditorPage />,
  },
  {
    path: 'academic-v2/admin/qp-patterns',
    element: <QpPatternEditorPage />,
  },
  {
    path: 'academic-v2/admin/exam-assignments',
    element: <ExamAssignmentAdminPage />,
  },
  {
    path: 'academic-v2/admin/approvals',
    element: <ApprovalInboxPage />,
  },
  {
    path: 'academic-v2/admin/internal-marks',
    element: <InternalMarkAdminPage />,
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
    path: 'academic-v2/exam/:examId',
    element: <MarkEntryPage />,
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
      title: 'Cycle Management',
      path: '/academic-v2/admin/cycles',
      description: 'Create and manage academic cycles',
    },
    {
      title: 'Class Types',
      path: '/academic-v2/admin/class-types',
      description: 'Manage class types and exam assignments',
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
