import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { derivePrimaryRole, getMe } from "./services/auth";
import { seedUCState } from "./utils/underConstruction";
import Navbar from "./components/navigation/Navbar";
import DashboardSidebar from './components/layout/DashboardSidebar';
import { useSidebar } from './components/layout/SidebarContext';
import ProtectedRoute from './components/ProtectedRoute';
import UCGate from './components/UCGate';
import { LazyErrorBoundary } from './components/LazyErrorBoundary';
import { safeLazy } from './utils/safeLazy';

// Route-based lazy-loaded pages
const TimetableEditor = safeLazy(() => import('./pages/advisor/TimetableEditor'), 'TimetableEditor');
const HodTimetableEditor = safeLazy(() => import('./pages/iqac/TimetableEditor'), 'HodTimetableEditor');
const TimetableAdminPage = safeLazy(() => import('./pages/timetable/admin/TimetableAdminPage'), 'TimetableAdminPage');
const ObeRequestsPage = safeLazy(() => import('./pages/iqac/ObeRequestsPage'), 'ObeRequestsPage');
const IQACEventApprovalPage = safeLazy(() => import('./pages/iqac/IQACEventApprovalPage'), 'IQACEventApprovalPage');
const AcademicControllerPage = safeLazy(() => import('./pages/iqac/AcademicControllerPage'), 'AcademicControllerPage');
const AcademicControllerCoursePage = safeLazy(() => import('./pages/iqac/AcademicControllerCoursePage'), 'AcademicControllerCoursePage');
const AcademicControllerCourseMarksPage = safeLazy(() => import('./pages/iqac/AcademicControllerCourseMarksPage'), 'AcademicControllerCourseMarksPage');
const AcademicControllerCourseOBEPage = safeLazy(() => import('./pages/iqac/AcademicControllerCourseOBEPage'), 'AcademicControllerCourseOBEPage');
const IQACQuestionBankLogsPage = safeLazy(() => import('./pages/iqac/IQACQuestionBankLogsPage'), 'IQACQuestionBankLogsPage');
const IQACQuestionBankPage = safeLazy(() => import('./pages/iqac/IQACQuestionBankPage'), 'IQACQuestionBankPage');
const InternalMarkPage = safeLazy(() => import('./pages/iqac/InternalMarkPage'), 'InternalMarkPage');
const OBERequestsPage = safeLazy(() => import('./pages/obe/OBERequestsPage'), 'OBERequestsPage');
const OBEDueDatesPage = safeLazy(() => import('./pages/obe/OBEDueDatesPage'), 'OBEDueDatesPage');

const HomePage = safeLazy(() => import('./components/containers/HomePage'), 'HomePage');
const Login = safeLazy(() => import('./pages/auth/Login'), 'Login');
const DashboardPage = safeLazy(() => import('./pages/dashboard/Dashboard'), 'DashboardPage');
const SystemTransitionsPage = safeLazy(() => import('./pages/dashboard/SystemTransitionsPage'), 'SystemTransitionsPage');
const ProfilePage = safeLazy(() => import('./pages/profile/Profile'), 'ProfilePage');
const SettingsPage = safeLazy(() => import('./pages/settings/SettingsPage'), 'SettingsPage');
const WhatsAppSenderPage = safeLazy(() => import('./pages/settings/WhatsAppSenderPage'), 'WhatsAppSenderPage');
const UnderConstructionManagerPage = safeLazy(() => import('./pages/settings/UnderConstructionManagerPage'), 'UnderConstructionManagerPage');

const MasterList = safeLazy(() => import('./pages/curriculum/MasterList'), 'MasterList');
const MasterEditor = safeLazy(() => import('./pages/curriculum/MasterEditor'), 'MasterEditor');
const DeptList = safeLazy(() => import('./pages/curriculum/DeptList'), 'DeptList');
const ElectiveImport = safeLazy(() => import('./pages/curriculum/ElectiveImport'), 'ElectiveImport');
const AcademicPage = safeLazy(() => import('./pages/AcademicPage'), 'AcademicPage');
const QuestionImportPage = safeLazy(() => import('./pages/tools/QuestionImportPage'), 'QuestionImportPage');
const OBEPage = safeLazy(() => import('./pages/obe/OBEPage'), 'OBEPage');
const CourseOBEPage = safeLazy(() => import('./pages/CourseOBEPage'), 'CourseOBEPage');
const COTargetPage = safeLazy(() => import('./pages/lca/COTargetPage'), 'COTargetPage');

const OBERequestPage = safeLazy(() => import('./pages/obe/OBERequestPage'), 'OBERequestPage');
const AdvisorAssignments = safeLazy(() => import('./pages/hod/AdvisorAssignments'), 'AdvisorAssignments');
const TeachingAssignmentsPage = safeLazy(() => import('./pages/hod/TeachingAssignments'), 'TeachingAssignmentsPage');
const ObeEditRequestsPage = safeLazy(() => import('./pages/hod/ObeEditRequestsPage'), 'ObeEditRequestsPage');
const StudentsPage = safeLazy(() => import('./pages/staff/Students'), 'StudentsPage');
const StudentCompletionPage = safeLazy(() => import('./pages/iqac/StudentCompletionPage'), 'StudentCompletionPage');
const StudentHostelPage = safeLazy(() => import('./pages/hostel/StudentHostelPage'), 'StudentHostelPage');
const HostelAdminPage = safeLazy(() => import('./pages/hostel/HostelAdminPage'), 'HostelAdminPage');
const HostelModulesPage = safeLazy(() => import('./pages/hostel/HostelModulesPage'), 'HostelModulesPage');
const StudentTimetable = safeLazy(() => import('./pages/student/TimetableView'), 'StudentTimetable');
const StaffTimetable = safeLazy(() => import('./pages/staff/TimetableView'), 'StaffTimetable');
const AssignedSubjectsPage = safeLazy(() => import('./pages/staff/AssignedSubjects'), 'AssignedSubjectsPage');
const PeriodAttendance = safeLazy(() => import('./pages/staff/PeriodAttendance'), 'PeriodAttendance');
const AttendanceAnalytics = safeLazy(() => import('./pages/staff/AttendanceAnalytics'), 'AttendanceAnalytics');

const StudentAttendancePage = safeLazy(() => import('./pages/student/Attendance'), 'StudentAttendancePage');
const StudentAcademics = safeLazy(() => import('./pages/student/Academics'), 'StudentAcademics');
const MentorAssign = safeLazy(() => import('./pages/advisor/MentorAssign'), 'MentorAssign');
const NotificationsPage = safeLazy(() => import('./pages/Notifications'), 'NotificationsPage');
const AnnouncementsPage = safeLazy(() => import('./pages/announcements/AnnouncementsPage'), 'AnnouncementsPage');
const QueriesPage = safeLazy(() => import('./pages/queries/QueriesPage'), 'QueriesPage');
const FeedbackPage = safeLazy(() => import('./pages/feedback/FeedbackPage'), 'FeedbackPage');
const StaffsPage = safeLazy(() => import('./pages/StaffsPage'), 'StaffsPage');
const MasterTeachingAssignmentPage = safeLazy(() => import('./pages/iqac/MasterTeachingAssignmentPage'), 'MasterTeachingAssignmentPage');
const AcademicCalendarRedirect = safeLazy(() => import('./pages/academicCalendar/AcademicCalendarRedirect'), 'AcademicCalendarRedirect');
const AcademicCalendarPage = safeLazy(() => import('./pages/academicCalendar/AcademicCalendarPage'), 'AcademicCalendarPage');
const AcademicCalendarAdminPage = safeLazy(() => import('./pages/academicCalendar/admin'), 'AcademicCalendarAdminPage');
const BrandingLayout = safeLazy(() => import('./pages/branding/BrandingLayout'), 'BrandingLayout');

const HodResultAnalysisPage = safeLazy(() => import('./pages/hod/HodResultAnalysisPage'), 'HodResultAnalysisPage');
const HodEventsListPage = safeLazy(() => import('./pages/hod/events/HodEventsListPage'), 'HodEventsListPage');
const HodEventCreatePage = safeLazy(() => import('./pages/hod/events/HodEventCreatePage'), 'HodEventCreatePage');
const CanvaDesignEditorPage = safeLazy(() => import('./pages/hod/events/CanvaDesignEditorPage'), 'CanvaDesignEditorPage');
const PosterMakerPage = safeLazy(() => import('./pages/events/PosterMakerPage'), 'PosterMakerPage');
const PBASSubmissionPage = safeLazy(() => import('./pages/staff/PBASSubmissionPage'), 'PBASSubmissionPage');
const PBASManagerPage = safeLazy(() => import('./pages/iqac/PBASManagerPage'), 'PBASManagerPage');
const PBASAdminPage = safeLazy(() => import('./pages/pbas/admin/PBASAdminPage'), 'PBASAdminPage');
const PBASApprovalsPage = safeLazy(() => import('./pages/pbas/approvals/PBASApprovalsPage'), 'PBASApprovalsPage');

const StaffAttendanceUpload = safeLazy(() => import('./pages/PS'), 'StaffAttendanceUpload');
const MyAttendance = safeLazy(() => import('./pages/staff'), 'MyAttendance');
const HODStaffAttendancePage = safeLazy(() => import('./pages/hod/StaffAttendance'), 'HODStaffAttendancePage');
const FacultyAttendancePage = safeLazy(() => import('./pages/faculty/Attendance'), 'FacultyAttendancePage');
const PSStaffAttendanceViewPage = safeLazy(() => import('./pages/PS/StaffAttendanceView'), 'PSStaffAttendanceViewPage');
const RequestTemplatesPage = safeLazy(() => import('./pages/hr/RequestTemplatesPage'), 'RequestTemplatesPage');
const OrganizationStaffAttendanceAnalytics = safeLazy(() => import('./pages/hr/OrganizationStaffAttendanceAnalytics'), 'OrganizationStaffAttendanceAnalytics');
const ManageGatePage = safeLazy(() => import('./pages/hr/ManageGatePage'), 'ManageGatePage');
const GatePassLogsPage = safeLazy(() => import('./pages/hr/GatePassLogsPage'), 'GatePassLogsPage');
const StaffValidationPage = safeLazy(() => import('./pages/hr/StaffValidationPage'), 'StaffValidationPage');
const StaffSalaryPage = safeLazy(() => import('./pages/hr/StaffSalaryPage'), 'StaffSalaryPage');
const ExtStaffProfilesPage = safeLazy(() => import('./pages/EXTStaff/ExtStaffProfilesPage'), 'ExtStaffProfilesPage');
const SalaryPage = safeLazy(() => import('./pages/staff/SalaryPage'), 'SalaryPage');
const MyRequestsPage = safeLazy(() => import('./pages/staff-requests/MyRequestsPage'), 'MyRequestsPage');
const PendingApprovalsPage = safeLazy(() => import('./pages/staff-requests/PendingApprovalsPage'), 'PendingApprovalsPage');

const ApplicationsAdminPage = safeLazy(() => import('./pages/iqac/ApplicationsAdminPage'), 'ApplicationsAdminPage');
const ApplicationsInboxPage = safeLazy(() => import('./pages/applications/ApplicationsInboxPage'), 'ApplicationsInboxPage');
const ApplicationsPage = safeLazy(() => import('./pages/applications/ApplicationsPage'), 'ApplicationsPage');
const ApplicationFormPage = safeLazy(() => import('./pages/applications/ApplicationFormPage'), 'ApplicationFormPage');
const ApplicationDetailPage = safeLazy(() => import('./pages/applications/ApplicationDetailPage'), 'ApplicationDetailPage');
const CoePortalPage = safeLazy(() => import('./pages/COE/CoePortalPage'), 'CoePortalPage');
const StudentsList = safeLazy(() => import('./pages/COE/StudentsList'), 'StudentsList');
const CourseList = safeLazy(() => import('./pages/COE/CourseList'), 'CourseList');
const ArrearList = safeLazy(() => import('./pages/COE/ArrearList'), 'ArrearList');
const BundleAllocation = safeLazy(() => import('./pages/COE/BundleAllocation'), 'BundleAllocation');
const BundleBarcodeView = safeLazy(() => import('./pages/COE/BundleBarcodeView'), 'BundleBarcodeView');
const OnePageReport = safeLazy(() => import('./pages/COE/OnePageReport'), 'OnePageReport');
const IDCSScanTestPage = safeLazy(() => import('./pages/IDCSScan/TestPage'), 'IDCSScanTestPage');
const BarScan = safeLazy(() => import('./pages/COE/BarScan'), 'BarScan');
const BarScanMarkEntry = safeLazy(() => import('./pages/COE/BarScanMarkEntry'), 'BarScanMarkEntry');
const IDCSScanGatepassPage = safeLazy(() => import('./pages/IDCSScan/GatepassPage'), 'IDCSScanGatepassPage');
const FingerprintEnrollPage = safeLazy(() => import('./pages/IDCSScan/FingerprintEnrollPage'), 'FingerprintEnrollPage');
const BioSecureAdminPage = safeLazy(() => import('./pages/biosecure/admin/BioSecureAdminPage'), 'BioSecureAdminPage');
const BioSecureAdminLogsPage = safeLazy(() => import('./pages/biosecure/admin/BioSecureAdminLogsPage'), 'BioSecureAdminLogsPage');
const BioSecureStudentLogsPage = safeLazy(() => import('./pages/biosecure/student/BioSecureStudentLogsPage'), 'BioSecureStudentLogsPage');

const StudentsBarCode = safeLazy(() => import('./pages/DisciplineComittie/admin/StudentsBarCode'), 'StudentsBarCode');
const ConfigPage = safeLazy(() => import('./pages/DisciplineComittie/admin/ConfigPage'), 'ConfigPage');
const LogsPage = safeLazy(() => import('./pages/DisciplineComittie/admin/LogsPage'), 'LogsPage');
const DCAdminPage = safeLazy(() => import('./pages/DisciplineComittie/admin/DCAdminPage'), 'DCAdminPage');
const StaffDisciplinePage = safeLazy(() => import('./pages/DisciplineComittie/staff/StaffDisciplinePage'), 'StaffDisciplinePage');
const StudentDisciplinePage = safeLazy(() => import('./pages/DisciplineComittie/student/StudentDisciplinePage'), 'StudentDisciplinePage');
const RFReaderAssignCardsPage = safeLazy(() => import('./pages/RFReader/AssignCardsPage'), 'RFReaderAssignCardsPage');
const RFReaderCreateGatePage = safeLazy(() => import('./pages/RFReader/CreateGatePage'), 'RFReaderCreateGatePage');
const RFReaderTestStudentsPage = safeLazy(() => import('./pages/RFReader/TestStudentsPage'), 'RFReaderTestStudentsPage');
const RFReaderAddStudentsRFPage = safeLazy(() => import('./pages/RFReader/AddStudentsRFPage'), 'RFReaderAddStudentsRFPage');
const RFReaderGateScanPage = safeLazy(() => import('./pages/RFReader/GateScanPage'), 'RFReaderGateScanPage');
const RFReaderCardsDataPage = safeLazy(() => import('./pages/RFReader/CardsDataPage'), 'RFReaderCardsDataPage');
const BulkEntryPage = safeLazy(() => import('./pages/RFReader/BulkEntryPage'), 'BulkEntryPage');
const AttendanceAnalyticsRequestsPage = safeLazy(() => import('./pages/attendance/AttendanceAnalyticsRequestsPage'), 'AttendanceAnalyticsRequestsPage');
const RequestsPage = safeLazy(() => import('./pages/requests/RequestsPage'), 'RequestsPage');
const ProfileImageUpdateRequestsPage = safeLazy(() => import('./pages/requests/ProfileImageUpdateRequestsPage'), 'ProfileImageUpdateRequestsPage');
const MyProposalsPage = safeLazy(() => import('./pages/events/MyProposalsPage'), 'MyProposalsPage');
const ProposalApprovalPage = safeLazy(() => import('./pages/events/ProposalApprovalPage'), 'ProposalApprovalPage');
const CreditsPage = safeLazy(() => import('./pages/CreditsPage'), 'CreditsPage');
const RetrivalPage = safeLazy(() => import('./pages/COE/RetrivalPage'), 'RetrivalPage');
const LmsPage = safeLazy(() => import('./pages/lms/LmsPage'), 'LmsPage');
const FilePreviewPage = safeLazy(() => import('./pages/lms/FilePreviewPage'), 'FilePreviewPage');
const AuditManagementPage = safeLazy(() => import('./pages/audits/AuditManagementPage'), 'AuditManagementPage');
const AuditEntryPage = safeLazy(() => import('./pages/audits/AuditEntryPage'), 'AuditEntryPage');
const AuditATRPage = safeLazy(() => import('./pages/audits/AuditATRPage'), 'AuditATRPage');

// Academic 2.1 - Lazy load pages for code splitting
const AcV2VersionManagementPage = safeLazy(() => import('./pages/Academic 2.1/admin/version/VersionManagementPage'), 'VersionManagementPage');
const AcV2AdminDashboard = safeLazy(() => import('./pages/Academic 2.1/admin/AcademicV2AdminDashboard'), 'AcademicV2AdminDashboard');

// Visual Admin
const VisualAdminDashboard = safeLazy(() => import('./pages/visual_admin/VisualAdminDashboard'), 'VisualAdminDashboard');
const VisualAdminURLsPage = safeLazy(() => import('./pages/visual_admin/VisualAdminURLsPage'), 'VisualAdminURLsPage');
const AcademicVisualsPage = safeLazy(() => import('./pages/visual_admin/AcademicVisualsPage'), 'AcademicVisualsPage');

const AcV2PublishControlPage = safeLazy(() => import('./pages/Academic 2.1/admin/PublishControlPage'), 'PublishControlPage');
const AcV2ExamManagementPage = safeLazy(() => import('./pages/Academic 2.1/admin/ExamManagementPage'), 'ExamManagementPage');
const AcV2QpPatternEditorPage = safeLazy(() => import('./pages/Academic 2.1/admin/QpPatternEditorPage'), 'QpPatternEditorPage');
const AcV2ApprovalInboxPage = safeLazy(() => import('./pages/Academic 2.1/admin/ApprovalInboxPage'), 'ApprovalInboxPage');
const AcV2InternalMarkAdminPage = safeLazy(() => import('./pages/Academic 2.1/admin/InternalMarkAdminPage'), 'InternalMarkAdminPage');
const AcV2WeightagePage = safeLazy(() => import('./pages/Academic 2.1/admin/WeightagePage'), 'WeightagePage');
const AcV2CoAttainmentConfigPage = safeLazy(() => import('./pages/Academic 2.1/admin/coattainment/CoAttainmentConfig'), 'CoAttainmentConfig');
const AcV2ExportImportManagerPage = safeLazy(() => import('./pages/Academic 2.1/admin/export_import/ExportImportManagerPage'), 'ExportImportManagerPage');
const AcV2CourseListPage = safeLazy(() => import('./pages/Academic 2.1/faculty/CourseListPage'), 'CourseListPage');
const AcV2MarkEntryPage = safeLazy(() => import('./pages/Academic 2.1/faculty/MarkEntryPage'), 'MarkEntryPage');
const AcV2InternalMarkPage = safeLazy(() => import('./pages/Academic 2.1/faculty/InternalMarkPage'), 'InternalMarkPage');
const AcV2CqiEntryPage = safeLazy(() => import('./pages/Academic 2.1/faculty/CqiEntryPage'), 'CqiEntryPage');
const AcV2CourseManagerDashboard = safeLazy(() => import('./pages/Academic 2.1/admin/CourseManagerDashboard'), 'CourseManagerDashboard');
const AcV2CourseFacultyPage = safeLazy(() => import('./pages/Academic 2.1/admin/CourseFacultyPage'), 'CourseFacultyPage');
const AcV2AdminBypassCoursePage = safeLazy(() => import('./pages/Academic 2.1/admin/AdminBypassCoursePage'), 'AdminBypassCoursePage');
const AcV2BypassLogsPage = safeLazy(() => import('./pages/Academic 2.1/admin/BypassLogsPage'), 'BypassLogsPage');
const AcV2BypassShareLandingPage = safeLazy(() => import('./pages/Academic 2.1/admin/bypass/BypassShareLandingPage'), 'BypassShareLandingPage');
const AcV2PassMarkSettingsPage = safeLazy(() => import('./pages/Academic 2.1/admin/SettingsPage'), 'SettingsPage');
const AcV2GoogleSheetsPage = safeLazy(() => import('./pages/Academic 2.1/admin/GoogleSheetsPage'), 'GoogleSheetsPage');
const AcV2CdapTemplateEditorPage = safeLazy(() => import('./pages/Academic 2.1/admin/cdap/CDAPTemplateEditorPage'), 'CDAPTemplateEditorPage');
const AcV2CdapTemplatesPage = AcV2CdapTemplateEditorPage;
const AcV2LCAWorkflowPage = safeLazy(() => import('./pages/Academic 2.1/faculty/LCAWorkflowPage'), 'LCAWorkflowPage');
const AcV2StudentDashboardPage = safeLazy(() => import('./pages/Academic 2.1/students/DashboardPage'), 'StudentDashboardPage');
const AcV2StudentCourseListPage = safeLazy(() => import('./pages/Academic 2.1/students/CourseListPage'), 'StudentCourseListPage');
const AcV2StudentPastCoursesPage = safeLazy(() => import('./pages/Academic 2.1/students/PastCoursesPage'), 'StudentPastCoursesPage');
const AcV2StudentCourseDetailPage = safeLazy(() => import('./pages/Academic 2.1/students/CourseDetailPage'), 'StudentCourseDetailPage');
const AcademicPerformancePage = safeLazy(() => import('./pages/Academic 2.1/AcademicPerformancePage'), 'AcademicPerformancePage');
const AcV2SSAAssignPage = safeLazy(() => import('./pages/Academic 2.1/faculty/SSAAssignPage'), 'SSAAssignPage');
const AcV2SSASubmissionsPage = safeLazy(() => import('./pages/Academic 2.1/faculty/SSASubmissionsPage'), 'SSASubmissionsPage');
const AcV2SSAEvaluationPage = safeLazy(() => import('./pages/Academic 2.1/faculty/SSAEvaluationPage'), 'SSAEvaluationPage');
const AcV2SSAStudentAssignmentPage = safeLazy(() => import('./pages/Academic 2.1/students/SSAAssignmentPage'), 'SSAStudentAssignmentPage');

type RoleObj = { name: string };
type Me = {
  id: number;
  username: string;
  email?: string;
  roles?: string[];
  role?: string;
  permissions?: string[];
  profile_type?: string | null;
  profile?: any | null;
};

export default function App() {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { collapsed } = useSidebar();
  const bootstrapMeTimeoutMs = Math.max(
    Number((import.meta as any)?.env?.VITE_ME_BOOTSTRAP_TIMEOUT) || 20000,
    5000,
  );

  const canAccessCoePortal = (currentUser: Me | null) => {
    if (!currentUser) return false;
    const email = String(currentUser.email || '').toLowerCase().trim();
    const perms = (currentUser.permissions || []).map((p) => String(p || '').toLowerCase());
    return email === 'coe@krct.ac.in' || perms.includes('coe.portal.access');
  };

  const isBrandingUser = Boolean(
    user && (
      (Array.isArray(user.roles) && user.roles.some((r) => String(r || '').toUpperCase() === 'BRANDING')) ||
      (Array.isArray(user.permissions) && user.permissions.some((p) => String(p || '').toLowerCase() === 'branding.access'))
    )
  );

  useEffect(() => {
    // Check if user has an access token before attempting to fetch profile
    const token = localStorage.getItem('access')
    if (!token) {
      // No token means user is not logged in, skip API call
      setUser(null)
      setLoading(false)
      return
    }

    // Add a short timeout so the app doesn't stay on the Loading... screen
    // indefinitely if the backend is unavailable.
    let cancelled = false
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn(`getMe() timed out after ${bootstrapMeTimeoutMs}ms`)
        setUser(null)
        setLoading(false)
      }
    }, bootstrapMeTimeoutMs)

    getMe()
      .then((r) => {
        if (cancelled) return
        // Normalize roles to string array and keep profile info
        const normalizedUser = {
          ...r,
          roles: Array.isArray(r.roles)
            ? r.roles.map((role: string | RoleObj) =>
                typeof role === 'string' ? role : role.name,
              )
            : [],
          role: derivePrimaryRole(r.roles),
          permissions: Array.isArray(r.permissions) ? r.permissions : [],
          profile_type: r.profile_type || null,
          profile: r.profile || null,
        };
        seedUCState((r as any).under_construction || {});
        setUser(normalizedUser as Me);
      })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) { clearTimeout(timeout); setLoading(false) } })

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [bootstrapMeTimeoutMs]);

  useEffect(() => {
    const onMeUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as Me | null | undefined;
      if (detail === null) {
        // Session ended (logout): drop in-memory identity immediately so no
        // stale dashboard renders before the router switches to /login.
        setUser(null);
        return;
      }
      if (!detail) return;
      const normalizedUser = {
        ...detail,
        roles: Array.isArray(detail.roles)
          ? detail.roles.map((role: string | RoleObj) =>
              typeof role === 'string' ? role : role.name,
            )
          : [],
        role: derivePrimaryRole(detail.roles as any),
        permissions: Array.isArray(detail.permissions) ? detail.permissions : [],
        profile_type: detail.profile_type || null,
        profile: detail.profile || null,
      };
      seedUCState((detail as any).under_construction || {});
      setUser(normalizedUser as Me);
    };

    window.addEventListener('idcs:me-updated', onMeUpdated as EventListener);
    return () => window.removeEventListener('idcs:me-updated', onMeUpdated as EventListener);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // ── Branding role: isolated layout, no Navbar / DashboardSidebar ────────
  if (user && isBrandingUser) {
    return (
      <LazyErrorBoundary>
        <React.Suspense fallback={<div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
          <Routes>
            <Route
              path="/branding/*"
              element={<ProtectedRoute user={user} requiredPermissions={["branding.access"]} element={<BrandingLayout user={user} />} />}
            />
            {/* Any other path → redirect into branding dashboard */}
            <Route path="*" element={<Navigate to="/branding" replace />} />
          </Routes>
        </React.Suspense>
      </LazyErrorBoundary>
    );
  }
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Navbar user={user} />
      {user ? (
        <div className="flex">
          <DashboardSidebar user={user} />
          <main
            className={`flex-1 min-w-0 transition-all duration-300 pt-20 overflow-x-hidden ${
              // Sidebar is `fixed`, so using `ml-*` here would increase total page width
              // (main still occupies full width, plus margin). Use `pl-*` instead.
              collapsed ? 'lg:pl-20' : 'lg:pl-64'
            }`}
          >
            <UCGate user={user}>
            <div className="app-main-zoom">
              <LazyErrorBoundary>
                <React.Suspense fallback={<div className="flex justify-center items-center min-h-[50vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
                  <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/login" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/credits" element={<CreditsPage />} />
                <Route path="/profile" element={<ProfilePage user={user} />} />
                <Route
                  path="/settings"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<SettingsPage />} />}
                />
                <Route
                  path="/settings/whatsapp-sender"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<WhatsAppSenderPage />} />}
                />
                <Route
                  path="/settings/under-construction"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<UnderConstructionManagerPage />} />}
                />
                <Route
                  path="/iqac/applications-admin"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<ApplicationsAdminPage />} />}
                />
                <Route
                  path="/iqac/audits"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<AuditManagementPage />} />}
                />
                <Route
                  path="/audits/entry"
                  element={<ProtectedRoute user={user} requiredRoles={['STAFF', 'FACULTY', 'IQAC', 'HOD', 'AHOD', 'AP']} element={<AuditEntryPage />} />}
                />
                <Route
                  path="/audits/atr"
                  element={<ProtectedRoute user={user} requiredRoles={['STAFF', 'FACULTY', 'IQAC', 'HOD', 'AHOD', 'AP']} element={<AuditATRPage />} />}
                />
                <Route
                  path="/applications"
                  element={<ApplicationsPage />}
                />
                <Route
                  path="/applications/new/:typeId"
                  element={<ApplicationFormPage />}
                />
                <Route
                  path="/applications/inbox"
                  element={<ApplicationsInboxPage />}
                />
                <Route
                  path="/applications/:id"
                  element={<ApplicationDetailPage />}
                />
                <Route
                  path="/coe"
                  element={canAccessCoePortal(user) ? <CoePortalPage user={user} /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/students"
                  element={canAccessCoePortal(user) ? <StudentsList /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/courses"
                  element={canAccessCoePortal(user) ? <CourseList /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/arrears"
                  element={canAccessCoePortal(user) ? <ArrearList /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/bundle-allocation"
                  element={canAccessCoePortal(user) ? <BundleAllocation /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/bundle-barcodes"
                  element={canAccessCoePortal(user) ? <BundleBarcodeView /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/bar-scan"
                  element={canAccessCoePortal(user) ? <BarScan /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/bar-scan/entry"
                  element={canAccessCoePortal(user) ? <BarScanMarkEntry /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/retrival"
                  element={canAccessCoePortal(user) ? <RetrivalPage /> : <Navigate to="/dashboard" replace />}
                />
                <Route
                  path="/coe/one-page-report"
                  element={canAccessCoePortal(user) ? <OnePageReport /> : <Navigate to="/dashboard" replace />}
                />
                <Route path="/queries" element={<QueriesPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route
                  path="/announcements"
                  element={<ProtectedRoute user={user} requiredPermissions={["announcements.view_announcement_page"]} element={<AnnouncementsPage user={user} />} />}
                />
                <Route
                  path="/announcements/sent"
                  element={<ProtectedRoute user={user} requiredPermissions={["announcements.view_announcement_page"]} element={<AnnouncementsPage user={user} />} />}
                />
                <Route
                  path="/lms"
                  element={<ProtectedRoute user={user} requiredRoles={["STUDENT", "STAFF", "FACULTY", "HOD", "AHOD", "IQAC"]} requiredPermissions={["lms.page.student", "lms.page.staff", "lms.page.hod", "lms.page.ahod", "lms.page.iqac"]} element={<LmsPage user={user} />} />}
                />
                <Route
                  path="/lms/preview/file/:materialId"
                  element={<ProtectedRoute user={user} requiredRoles={["STUDENT", "STAFF", "FACULTY", "HOD", "AHOD", "IQAC"]} requiredPermissions={["lms.page.student", "lms.page.staff", "lms.page.hod", "lms.page.ahod", "lms.page.iqac"]} element={<FilePreviewPage />} />}
                />
                <Route
                  path="/ps/staff-attendance/upload"
                  element={<ProtectedRoute user={user} requiredRoles={['PS']} element={<StaffAttendanceUpload />} />}
                />
                <Route
                  path="/feedback"
                  element={<ProtectedRoute user={user} requiredPermissions={["feedback.feedback_page"]} element={<FeedbackPage />} />}
                />
                <Route
                  path="/student/feedback"
                  element={<ProtectedRoute user={user} requiredProfile={'STUDENT'} requiredPermissions={["feedback.feedback_page"]} element={<FeedbackPage />} />}
                />
                <Route path="/academic-calendar" element={<AcademicCalendarRedirect user={user} />} />
                <Route
                  path="/iqac/calendar-admin"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<AcademicCalendarAdminPage />} />}
                />
                <Route
                  path="/iqac/calendar"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<AcademicCalendarPage mode="iqac" />} />}
                />
                <Route
                  path="/hod/calendar"
                  element={<ProtectedRoute user={user} requiredRoles={['HOD']} element={<AcademicCalendarPage mode="hod" />} />}
                />
                <Route
                  path="/student/calendar"
                  element={<ProtectedRoute user={user} requiredProfile={'STUDENT'} element={<AcademicCalendarPage mode="student" />} />}
                />
                <Route path="/import/questions" element={<QuestionImportPage />} />
                <Route path="/curriculum/master" element={<MasterList />} />
                <Route path="/curriculum/master/:id" element={<MasterEditor />} />
                <Route path="/curriculum/master/new" element={<MasterEditor />} />
                <Route path="/curriculum/department" element={<DeptList />} />

                <Route
                  path="/curriculum/elective-import"
                  element={<ProtectedRoute user={user} requiredPermissions={["curriculum.import_elective_choices"]} element={<ElectiveImport />} />}
                />

                {/* OBE/marks/COAttainment routes removed */}
                <Route path="/obe" element={<OBEPage />} />
                <Route path="/obe/course/:code/lca/cotarget" element={<COTargetPageWrapper />} />
                <Route path="/obe/course/:code/*" element={<CourseOBEPage />} />
                <Route path="/obe/request" element={<ProtectedRoute user={user} requiredProfile={'STAFF'} element={<OBERequestPage />} />} />
                <Route path="/obe/master/requests" element={<ProtectedRoute user={user} requiredPermissions={["obe.master_obe_requests"]} element={<OBERequestsPage />} />} />
                <Route path="/obe/master/due-dates" element={<ProtectedRoute user={user} requiredPermissions={["obe.master.manage"]} element={<OBEDueDatesPage />} />} />
                <Route path="/academic" element={<AcademicPage />} />
                {/* AcademicPerformancePage is lazy-loaded, so it MUST be wrapped in a
                    Suspense boundary: without one React throws while the chunk is
                    still being fetched, which blanks the whole app until a manual
                    refresh. LazyErrorBoundary turns any chunk/render failure into a
                    visible fallback instead of an empty page. */}
                <Route
                  path="/academic-performance"
                  element={
                    <LazyErrorBoundary>
                      <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                        <AcademicPerformancePage />
                      </React.Suspense>
                    </LazyErrorBoundary>
                  }
                />

                <Route
                  path="/hod/advisors"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD"]} requiredPermissions={["academics.assign_advisor"]} element={<AdvisorAssignments />} />}
                />
                <Route
                  path="/hod/obe-requests"
                  element={<ProtectedRoute user={user} requiredPermissions={["obe.hod_obe_requests"]} element={<ObeEditRequestsPage />} />}
                />
                <Route
                  path="/hod/result-analysis"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD", "ADVISOR"]} element={<HodResultAnalysisPage />} />}
                />
                <Route
                  path="/hod/events"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD"]} element={<HodEventsListPage />} />}
                />
                <Route
                  path="/hod/events/create"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD"]} element={<HodEventCreatePage />} />}
                />
                <Route
                  path="/hod/events/canva-editor"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD"]} element={<CanvaDesignEditorPage />} />}
                />
                {/* Canva Poster Maker — accessible to HOD, IQAC, and STAFF */}
                <Route
                  path="/poster-maker"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD", "IQAC", "STAFF"]} element={<PosterMakerPage />} />}
                />
                {/* ── Event Proposal Workflow Routes ─────────────────────────────── */}
                <Route
                  path="/events/create-event"
                  element={<ProtectedRoute user={user} requiredPermissions={["events.create_proposal"]} element={<PosterMakerPage staffMode />} />}
                />
                <Route
                  path="/events/my-proposals"
                  element={<ProtectedRoute user={user} requiredPermissions={["events.create_proposal"]} element={<MyProposalsPage />} />}
                />
                <Route
                  path="/hod/event-approvals"
                  element={<ProtectedRoute user={user} requiredPermissions={["events.hod_approve"]} element={<ProposalApprovalPage role="hod" />} />}
                />
                <Route
                  path="/haa/event-approvals"
                  element={<ProtectedRoute user={user} requiredPermissions={["events.haa_approve"]} element={<ProposalApprovalPage role="haa" />} />}
                />
                <Route
                  path="/hod/staff-attendance"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD"]} element={<HODStaffAttendancePage />} />}
                />
                <Route
                  path="/staffs"
                  element={<ProtectedRoute user={user} requiredRoles={['PS']} requiredPermissions={["academics.view_staffs_page"]} element={<StaffsPage />} />}
                />
                <Route
                  path="/advisor/teaching"
                  element={<ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.assign_teaching"]} element={<TeachingAssignmentsPage />} />}
                />
                <Route
                  path="/iqac/master-teaching-assignment"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC", "ADMIN"]} element={<MasterTeachingAssignmentPage />} />}
                />
                <Route
                  path="/iqac/timetable"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["timetable.manage_templates"]} element={<TimetableAdminPage />} />}
                />
                <Route
                  path="/iqac/system-transitions"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC", "ADMIN"]} element={<SystemTransitionsPage />} />}
                />
                <Route
                  path="/system-transitions"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC", "ADMIN"]} element={<SystemTransitionsPage />} />}
                />
                <Route
                  path="/iqac/event-approvals"
                  element={<ProtectedRoute user={user} requiredPermissions={["obe.master.manage"]} element={<IQACEventApprovalPage />} />}
                />
                <Route
                  path="/iqac/academic-controller"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<AcademicControllerPage />} />}
                />
                <Route
                  path="/iqac/academic-controller/course/:courseCode"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<AcademicControllerCoursePage />} />}
                />
                <Route
                  path="/iqac/academic-controller/course/:courseCode/marks/:taId"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<AcademicControllerCourseMarksPage />} />}
                />
                  <Route
                    path="/iqac/academic-controller/course/:courseCode/question-bank"
                    element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<IQACQuestionBankPageWrapper />} />}
                  />
                  <Route
                    path="/iqac/academic-controller/course/:courseCode/question-bank-logs"
                    element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<IQACQuestionBankLogsPage />} />}
                  />
                <Route
                  path="/iqac/academic-controller/course/:courseCode/internal-mark/:taId"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<InternalMarkPage />} />}
                />
                <Route
                  path="/iqac/academic-controller/course/:courseCode/obe/:taId/*"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<AcademicControllerCourseOBEPage />} />}
                />
                <Route
                  path="/iqac/obe-requests"
                  element={<ProtectedRoute user={user} requiredPermissions={["obe.master_obe_requests"]} element={<ObeRequestsPage />} />}
                />
                {/* PBAS IQAC route removed */}
                <Route
                  path="/faculty/attendance"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<FacultyAttendancePage />} />}
                />
                <Route
                  path="/iqac/staff-attendance"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<FacultyAttendancePage />} />}
                />
                <Route
                  path="/ps/staff-attendance/view"
                  element={<ProtectedRoute user={user} requiredRoles={['PS', 'ADMIN']} element={<PSStaffAttendanceViewPage />} />}
                />
                {/* ── IDCSScan (SECURITY / ADMIN) ─────────────────────────── */}
                <Route
                  path="/idscan/test"
                  element={<ProtectedRoute user={user} requiredRoles={['SECURITY']} element={<IDCSScanTestPage />} />}
                />
                <Route
                  path="/idscan/assign-cards"
                  element={<ProtectedRoute user={user} requiredRoles={['SECURITY', 'LIBRARY']} element={<RFReaderAssignCardsPage />} />}
                />
                <Route
                  path="/idscan/cards-data"
                  element={<ProtectedRoute user={user} requiredRoles={['LIBRARY', 'SECURITY', 'IQAC', 'ADMIN']} element={<RFReaderCardsDataPage />} />}
                />
                <Route
                  path="/idscan/bulk-entry"
                  element={<ProtectedRoute user={user} requiredRoles={['LIBRARY', 'SECURITY', 'IQAC', 'ADMIN']} element={<BulkEntryPage />} />}
                />
                <Route
                  path="/idscan/gatepass"
                  element={<ProtectedRoute user={user} requiredRoles={['SECURITY']} element={<IDCSScanGatepassPage />} />}
                />
                <Route
                  path="/idscan/gatescan"
                  element={<ProtectedRoute user={user} requiredRoles={['SECURITY']} element={<RFReaderGateScanPage />} />}
                />
                <Route
                  path="/idscan/fingerprint"
                  element={<ProtectedRoute user={user} requiredRoles={['LIBRARY', 'SECURITY', 'IQAC', 'ADMIN']} element={<FingerprintEnrollPage />} />}
                />
                <Route
                  path="/biosecure/admin"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'SECURITY', 'HOD', 'BIOSECURE_ADMIN']} element={<BioSecureAdminPage />} />}
                />
                <Route
                  path="/biosecure/admin/logs"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'SECURITY', 'HOD', 'BIOSECURE_ADMIN']} element={<BioSecureAdminLogsPage />} />}
                />
                <Route
                  path="/biosecure/student/logs"
                  element={<ProtectedRoute user={user} element={<BioSecureStudentLogsPage />} />}
                />
                {/* Discipline Committee Routes */}
                <Route
                  path="/discipline/admin"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DISCIPLINE_COMMITTEE', 'DisciplineCommitteeAdmin', 'Discipline Committee']} element={<DCAdminPage />} />}
                />
                <Route
                  path="/discipline/admin/students-barcode"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DISCIPLINE_COMMITTEE', 'DisciplineCommitteeAdmin', 'Discipline Committee']} element={<StudentsBarCode />} />}
                />
                <Route
                  path="/discipline/admin/config"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DisciplineCommitteeAdmin']} element={<ConfigPage />} />}
                />
                <Route
                  path="/discipline/admin/logs"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DISCIPLINE_COMMITTEE', 'DisciplineCommitteeAdmin', 'Discipline Committee']} element={<LogsPage />} />}
                />
                <Route
                  path="/discipline/staff"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DISCIPLINE_COMMITTEE', 'DisciplineCommitteeAdmin', 'Discipline Committee', 'STAFF', 'FACULTY']} element={<StaffDisciplinePage />} />}
                />
                <Route
                  path="/discipline/student"
                  element={<ProtectedRoute user={user} requiredRoles={['STUDENT', 'IQAC', 'ADMIN']} element={<StudentDisciplinePage />} />}
                />
                <Route
                  path="/iqac/rf-reader"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={["IQAC"]}
                      element={<Navigate to="/iqac/rf-reader/create-gate" replace />}
                    />
                  }
                />
                <Route
                  path="/iqac/rf-reader/create-gate"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} element={<RFReaderCreateGatePage />} />}
                />
                <Route
                  path="/iqac/rf-reader/test-students"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} element={<RFReaderTestStudentsPage />} />}
                />
                <Route
                  path="/iqac/rf-reader/add-students-rf"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} element={<RFReaderAddStudentsRFPage />} />}
                />
                <Route
                  path="/advisor/timetable"
                  element={<ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["timetable.assign"]} element={<TimetableEditor />} />}
                />
                <Route
                  path="/advisor/mentor"
                  element={<ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.assign_mentor"]} element={<MentorAssign />} />}
                />
                <Route
                  path="/student/timetable"
                  element={<ProtectedRoute user={user} requiredProfile={'STUDENT'} requiredPermissions={["timetable.view"]} element={<StudentTimetable />} />}
                />
                <Route
                  path="/student/attendance"
                  element={<ProtectedRoute user={user} requiredProfile={'STUDENT'} element={<StudentAttendancePage />} />}
                />
                <Route
                  path="/student/academics"
                  element={<ProtectedRoute user={user} requiredProfile={'STUDENT'} element={<StudentAcademics />} />}
                />
                {/* Hostel & Student Facilities */}
                <Route
                  path="/student/hostel"
                  element={<ProtectedRoute user={user} requiredProfile={'STUDENT'} element={<StudentHostelPage />} />}
                />
                <Route
                  path="/student/hostel/modules"
                  element={<ProtectedRoute user={user} requiredProfile={'STUDENT'} element={<HostelModulesPage />} />}
                />
                <Route
                  path="/hostel/modules"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={[
                        'IQAC', 'ADMIN', 'PRINCIPAL', 'COLLEGE_ADMIN', 'HOSTEL_ADMIN',
                        'WARDEN', 'DEPUTY_WARDEN', 'MATRON', 'MAINTENANCE_STAFF',
                        'MESS_COORDINATOR', 'TRANSPORT_COORDINATOR', 'SECURITY_STAFF',
                      ]}
                      element={<HostelModulesPage />}
                    />
                  }
                />
                <Route
                  path="/hostel/admin"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={[
                        'IQAC', 'ADMIN', 'PRINCIPAL', 'COLLEGE_ADMIN', 'HOSTEL_ADMIN',
                        'WARDEN', 'DEPUTY_WARDEN', 'MATRON', 'MAINTENANCE_STAFF',
                        'MESS_COORDINATOR', 'TRANSPORT_COORDINATOR', 'SECURITY_STAFF',
                      ]}
                      element={<HostelAdminPage />}
                    />
                  }
                />
                {/* Student PBAS route removed */}
                {/* Attendance pages removed */}
                <Route
                  path="/staff/timetable"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={["timetable.view"]} element={<StaffTimetable />} />}
                />
                <Route
                  path="/staff/assigned-subjects"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={["academics.view_assigned_subjects"]} element={<AssignedSubjectsPage />} />}
                />
                <Route

                  path="/staff/students"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={["students.view_students"]} element={<StudentsPage user={user} />} />}
                />
                <Route
                  path="/iqac/students/completion"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'Superuser']} element={<StudentCompletionPage />} />}
                />
                <Route
                  path="/staff/students/completion"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC', 'ADMIN', 'Superuser']} element={<StudentCompletionPage />} />}
                />
                {/* Staff PBAS route removed */}
                <Route
                  path="/staff/period-attendance"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={['academics.mark_attendance']} element={<PeriodAttendance />} />}
                />



                <Route
                  path="/staff/analytics"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['HOD', 'IQAC']}
                      requiredPermissions={[
                        'academics.view_all_attendance',
                        'academics.view_attendance_overall',
                        'academics.view_all_departments',
                        'academics.view_department_attendance',
                        'academics.view_class_attendance',
                        'academics.view_section_attendance',
                      ]}
                      element={<AttendanceAnalytics />}
                    />
                  }
                />
                <Route
                  path="/staff/my-attendance"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} element={<MyAttendance />} />}
                />
                <Route
                  path="/staff/salary"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} element={<SalaryPage />} />}
                />

                {/* HR Routes */}
                <Route
                  path="/hr/request-templates"
                  element={<ProtectedRoute user={user} requiredRoles={['HR']} requiredPermissions={['staff_requests.manage_templates']} element={<RequestTemplatesPage />} />}
                />
                <Route
                  path="/hr/staff-attendance-analytics"
                  element={<ProtectedRoute user={user} requiredRoles={['HR']} requiredPermissions={['staff_requests.manage_templates']} element={<OrganizationStaffAttendanceAnalytics />} />}
                />
                <Route
                  path="/hr/manage-gate"
                  element={<ProtectedRoute user={user} requiredRoles={['HR', 'SECURITY']} element={<ManageGatePage />} />}
                />
                <Route
                  path="/hr/gatepass-logs"
                  element={<ProtectedRoute user={user} requiredRoles={['HR']} element={<GatePassLogsPage />} />}
                />
                <Route
                  path="/hr/staff-validation"
                  element={<ProtectedRoute user={user} requiredRoles={['HR']} requiredPermissions={['staff_requests.manage_templates']} element={<StaffValidationPage />} />}
                />
                <Route
                  path="/hr/staff-salary"
                  element={<ProtectedRoute user={user} requiredRoles={['HR']} requiredPermissions={['staff_requests.manage_templates']} element={<StaffSalaryPage />} />}
                />

                <Route
                  path="/iqac/external-management"
                  element={<ProtectedRoute user={user} requiredRoles={['IQAC']} element={<ExtStaffProfilesPage />} />}
                />

                {/* Staff Requests Routes */}
                <Route
                  path="/staff-requests/my-requests"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} element={<MyRequestsPage />} />}
                />
                <Route
                  path="/staff-requests/pending-approvals"
                  element={<ProtectedRoute user={user} requiredRoles={['HOD', 'AHOD', 'HR', 'HAA', 'IQAC', 'PS', 'PRINCIPAL', 'ADMIN']} requiredPermissions={['staff_requests.approve_requests']} element={<PendingApprovalsPage />} />}
                />

                <Route
                  path="/attendance-analytics/requests"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['HOD', 'IQAC']}
                      element={<AttendanceAnalyticsRequestsPage />}
                    />
                  }
                />
                <Route
                  path="/requests"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      element={<RequestsPage user={user} />}
                    />
                  }
                />
                <Route
                  path="/requests/profile-image-update"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredPermissions={['accounts.profile_image_unlock_approve']}
                      element={<ProfileImageUpdateRequestsPage />}
                    />
                  }
                />

                {/* ── Academic 2.1 Routes ─────────────────────────────────── */}
                {/* Admin Version Management Page (Primary Entry) */}
                <Route
                  path="/academic-v2/admin"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2VersionManagementPage />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/version"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2VersionManagementPage />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* Academic Controller Dashboard (Scoped to a Version) */}
                <Route
                  path="/academic-v2/admin/controller"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2AdminDashboard />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/version/:versionId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2AdminDashboard />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/export-import-manager"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2ExportImportManagerPage />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* Admin Routes (IQAC only) */}
                <Route
                  path="/academic-v2/admin/publish-control"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2PublishControlPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/exam-management"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2ExamManagementPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/cycles"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={<Navigate to="/academic-v2/admin/exam-management?tab=cycles" replace />}
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/class-types"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={<Navigate to="/academic-v2/admin/exam-management?tab=class-types" replace />}
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/qp-patterns"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2QpPatternEditorPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/exam-assignments"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={<Navigate to="/academic-v2/admin/exam-management?tab=exam-assignments" replace />}
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/approvals"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2ApprovalInboxPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/internal-marks"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2InternalMarkAdminPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/weightage"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2WeightagePage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/co-attainment-config"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CoAttainmentConfigPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/google-sheets"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2GoogleSheetsPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/cdap-monitor"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <Navigate to="/academic-v2/admin/cdap-templates" replace />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/cdap-templates"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CdapTemplatesPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/cdap-templates/new"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CdapTemplateEditorPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/cdap-templates/:templateId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['IQAC']}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CdapTemplateEditorPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* Faculty Routes (Staff) */}
                <Route
                  path="/academic-v2/courses"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CourseListPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/course/:courseId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2InternalMarkPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/course/:courseId/cqi"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CqiEntryPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/course/:courseId/lca"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2LCAWorkflowPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* Academic 2.1 Student Routes */}
                <Route
                  path="/academic-v2/student/dashboard"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STUDENT'}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2StudentDashboardPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/student/courses"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STUDENT'}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2StudentCourseListPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/student/past-courses"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STUDENT'}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2StudentPastCoursesPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/student/course/:courseId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STUDENT'}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2StudentCourseDetailPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/cqi/:examId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CqiEntryPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/exam/:examId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2MarkEntryPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* SSA assignment workflow */}
                <Route
                  path="/academic-v2/ssa/assign/:examId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2SSAAssignPage />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/ssa/submissions/:examId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2SSASubmissionsPage />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/ssa/evaluate/:submissionId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.staff']}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2SSAEvaluationPage />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* SSA assignment workflow — Student */}
                <Route
                  path="/academic-v2/student/ssa/:examId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STUDENT'}
                      element={
                        <LazyErrorBoundary>
                          <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                            <AcV2SSAStudentAssignmentPage />
                          </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* Academic 2.1 Admin - Course Manager & Bypass */}
                <Route
                  path="/academic-v2/admin/course-manager"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CourseManagerDashboard />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/course-manager/:taId/faculty"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2CourseFacultyPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/bypass/:sessionId/course/:courseId"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2AdminBypassCoursePage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                <Route
                  path="/academic-v2/admin/bypass/logs"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2BypassLogsPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* Shared bypass link landing — handles its own auth check & redirect */}
                <Route
                  path="/academic-v2/bypass-share/:token"
                  element={
                    <LazyErrorBoundary>
                    <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                      <AcV2BypassShareLandingPage />
                    </React.Suspense>
                    </LazyErrorBoundary>
                  }
                />
                <Route
                  path="/academic-v2/admin/pass-mark"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
                      requiredPermissions={['academic_v2.page.admin']}
                      element={
                        <LazyErrorBoundary>
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcV2PassMarkSettingsPage />
                        </React.Suspense>
                        </LazyErrorBoundary>
                      }
                    />
                  }
                />
                {/* ── Visual Admin Routes ─────────────────────────────── */}
                <Route
                  path="/academic-visuals"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['VISUAL_ADMIN']}
                      element={
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <AcademicVisualsPage />
                        </React.Suspense>
                      }
                    />
                  }
                />
                <Route
                  path="/visual-admin"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['VISUAL_ADMIN']}
                      element={
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <VisualAdminDashboard />
                        </React.Suspense>
                      }
                    />
                  }
                />
                <Route
                  path="/visual-admin/urls"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredRoles={['VISUAL_ADMIN']}
                      element={
                        <React.Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
                          <VisualAdminURLsPage />
                        </React.Suspense>
                      }
                    />
                  }
                />

                {/* ────────────────────────────────────────────────────────────── */}

                {/* PBAS staff, student and admin routes */}
                <Route path="/pbas/staff" element={<ProtectedRoute user={user} requiredRoles={["STAFF", "STUDENT"]} element={<PBASSubmissionPage />} />} />
                <Route path="/student/pbas" element={<ProtectedRoute user={user} requiredRoles={["STUDENT"]} element={<PBASSubmissionPage viewer="student" />} />} />
                <Route path="/pbas/admin" element={<ProtectedRoute user={user} requiredRoles={["PBAS_ADMIN", "PBASADMIN", "PBAS_MANAGER", "IQAC", "ADMIN"]} element={<PBASAdminPage />} />} />
                <Route path="/pbas/approvals" element={<ProtectedRoute user={user} requiredRoles={["PBAS_APPROVER", "PBAS_ADMIN", "PBAS_MANAGER", "PBASADMIN", "IQAC", "ADMIN", "PRINCIPAL", "PS"]} element={<PBASApprovalsPage user={user} />} />} />

                <Route path="*" element={user ? <Navigate to="/dashboard" replace /> : <HomePage user={user} />} />
                {/* Prevent regular users from accessing Branding-only routes */}
                <Route path="/branding/*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </React.Suspense>
              </LazyErrorBoundary>
            </div>
            </UCGate>
          </main>
        </div>
      ) : (
        <div className="pt-16">
          <LazyErrorBoundary>
            <React.Suspense fallback={<div className="flex justify-center items-center min-h-[50vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
              <Routes>
                <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <HomePage user={user} />} />
                <Route path="/login" element={<Login />} />
                <Route path="/credits" element={<CreditsPage />} />
                <Route path="*" element={user ? <Navigate to="/dashboard" replace /> : <HomePage user={user} />} />
              </Routes>
            </React.Suspense>
          </LazyErrorBoundary>
        </div>

      )}
    </div>
  );
}

function IQACQuestionBankPageWrapper() {
  return <IQACQuestionBankPage />;
}

function COTargetPageWrapper() {
  const { code } = useParams<{ code: string }>();
  const courseCode = code ? decodeURIComponent(code) : undefined;
  return <COTargetPage courseCode={courseCode} />;
}
