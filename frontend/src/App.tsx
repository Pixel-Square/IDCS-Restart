import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { derivePrimaryRole, getMe } from "./services/auth";
import { seedUCState } from "./utils/underConstruction";
import Navbar from "./components/navigation/Navbar";
import DashboardSidebar from "./components/layout/DashboardSidebar";
import { useSidebar } from "./components/layout/SidebarContext";
import TimetableEditor from "./pages/advisor/TimetableEditor";
import HodTimetableEditor from "./pages/iqac/TimetableEditor";
import ObeRequestsPage from "./pages/iqac/ObeRequestsPage";
import IQACEventApprovalPage from "./pages/iqac/IQACEventApprovalPage";
import AcademicControllerPage from "./pages/iqac/AcademicControllerPage";
import AcademicControllerCoursePage from "./pages/iqac/AcademicControllerCoursePage";
import AcademicControllerCourseMarksPage from "./pages/iqac/AcademicControllerCourseMarksPage";
import AcademicControllerCourseOBEPage from "./pages/iqac/AcademicControllerCourseOBEPage";
import InternalMarkPage from "./pages/iqac/InternalMarkPage";
import OBERequestsPage from "./pages/obe/OBERequestsPage";
import OBEDueDatesPage from "./pages/obe/OBEDueDatesPage";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./components/containers/HomePage";
import DashboardPage from "./pages/dashboard/Dashboard";
import ProfilePage from "./pages/profile/Profile";
import SettingsPage from "./pages/settings/SettingsPage";
import WhatsAppSenderPage from "./pages/settings/WhatsAppSenderPage";
import UnderConstructionManagerPage from "./pages/settings/UnderConstructionManagerPage";
import ConditionsPage from "./pages/settings/ConditionsPage";
import UCGate from "./components/UCGate";
import MasterList from "./pages/curriculum/MasterList";
import MasterEditor from "./pages/curriculum/MasterEditor";
import DeptList from "./pages/curriculum/DeptList";
import ElectiveImport from "./pages/curriculum/ElectiveImport";
import AcademicPage from "./pages/AcademicPage";
import QuestionImportPage from "./pages/tools/QuestionImportPage";
import OBEPage from "./pages/obe/OBEPage";
import CourseOBEPage from "./pages/CourseOBEPage";
import COTargetPage from "./pages/lca/COTargetPage";
import { useParams } from "react-router-dom";
import OBERequestPage from "./pages/obe/OBERequestPage";
import AdvisorAssignments from "./pages/hod/AdvisorAssignments";
import TeachingAssignmentsPage from "./pages/hod/TeachingAssignments";
import ObeEditRequestsPage from "./pages/hod/ObeEditRequestsPage";
import StudentsPage from "./pages/staff/Students";
import StudentTimetable from "./pages/student/TimetableView";
import StaffTimetable from "./pages/staff/TimetableView";
import AssignedSubjectsPage from "./pages/staff/AssignedSubjects";
import PeriodAttendance from "./pages/staff/PeriodAttendance";
import AttendanceAnalytics from "./pages/staff/AttendanceAnalytics";
// SwapRequestsPage removed — swap requests handled via modal
import StudentAttendancePage from "./pages/student/Attendance";
import StudentAcademics from "./pages/student/Academics";
import MentorAssign from "./pages/advisor/MentorAssign";
import NotificationsPage from "./pages/Notifications";
import AnnouncementsPage from "./pages/announcements/AnnouncementsPage";
import QueriesPage from "./pages/queries/QueriesPage";
import FeedbackPage from "./pages/feedback/FeedbackPage";
import StaffsPage from "./pages/StaffsPage";
import AcademicCalendarRedirect from "./pages/academicCalendar/AcademicCalendarRedirect";
import AcademicCalendarPage from "./pages/academicCalendar/AcademicCalendarPage";
import AcademicCalendarAdmin from "./pages/academicCalendar/AcademicCalendarAdmin";
import AcademicCalendarView from "./pages/academicCalendar/AcademicCalendarView";
import CalendarEvents from "./pages/academicCalendar/CalendarEvents";
import BrandingLayout from "./pages/branding/BrandingLayout";
import HodResultAnalysisPage from "./pages/hod/HodResultAnalysisPage";
import HodEventsListPage from "./pages/hod/events/HodEventsListPage";
import HodEventCreatePage from "./pages/hod/events/HodEventCreatePage";
import CanvaDesignEditorPage from "./pages/hod/events/CanvaDesignEditorPage";
import PosterMakerPage from "./pages/events/PosterMakerPage";
import PBASSubmissionPage from "./pages/staff/PBASSubmissionPage";
import PBASManagerPage from "./pages/iqac/PBASManagerPage";
import { StaffAttendanceUpload } from "./pages/PS";
import { MyAttendance } from "./pages/staff";
import HODStaffAttendancePage from "./pages/hod/StaffAttendance";
import FacultyAttendancePage from "./pages/faculty/Attendance";
import PSStaffAttendanceViewPage from "./pages/PS/StaffAttendanceView";
import RequestTemplatesPage from "./pages/hr/RequestTemplatesPage";
import OrganizationStaffAttendanceAnalytics from "./pages/hr/OrganizationStaffAttendanceAnalytics";
import ManageGatePage from "./pages/hr/ManageGatePage";
import GatePassLogsPage from "./pages/hr/GatePassLogsPage";
import StaffValidationPage from "./pages/hr/StaffValidationPage";
import StaffSalaryPage from "./pages/hr/StaffSalaryPage";
import ExtStaffProfilesPage from "./pages/EXTStaff/ExtStaffProfilesPage";
import SalaryPage from "./pages/staff/SalaryPage";
import MyRequestsPage from "./pages/staff-requests/MyRequestsPage";
import PendingApprovalsPage from "./pages/staff-requests/PendingApprovalsPage";
import ApplicationsAdminPage from "./pages/iqac/ApplicationsAdminPage";
import ApplicationsInboxPage from "./pages/applications/ApplicationsInboxPage";
import ApplicationsPage from "./pages/applications/ApplicationsPage";
import ApplicationFormPage from "./pages/applications/ApplicationFormPage";
import ApplicationDetailPage from "./pages/applications/ApplicationDetailPage";
import CoePortalPage from "./pages/COE/CoePortalPage";
import StudentsList from "./pages/COE/StudentsList";
import CourseList from "./pages/COE/CourseList";
import ArrearList from "./pages/COE/ArrearList";
import BundleAllocation from "./pages/COE/BundleAllocation";
import BundleBarcodeView from "./pages/COE/BundleBarcodeView";
import OnePageReport from "./pages/COE/OnePageReport";
import IDCSScanTestPage from "./pages/IDCSScan/TestPage";
import BarScan from "./pages/COE/BarScan";
import BarScanMarkEntry from "./pages/COE/BarScanMarkEntry";
import IDCSScanGatepassPage from "./pages/IDCSScan/GatepassPage";
import FingerprintEnrollPage from "./pages/IDCSScan/FingerprintEnrollPage";
import RFReaderAssignCardsPage from "./pages/RFReader/AssignCardsPage";
import RFReaderCreateGatePage from "./pages/RFReader/CreateGatePage";
import RFReaderTestStudentsPage from "./pages/RFReader/TestStudentsPage";
import RFReaderAddStudentsRFPage from "./pages/RFReader/AddStudentsRFPage";
import RFReaderGateScanPage from "./pages/RFReader/GateScanPage";
import RFReaderCardsDataPage from "./pages/RFReader/CardsDataPage";
import BulkEntryPage from "./pages/RFReader/BulkEntryPage";
import AttendanceAnalyticsRequestsPage from "./pages/attendance/AttendanceAnalyticsRequestsPage";
import RequestsPage from "./pages/requests/RequestsPage";
import ProfileImageUpdateRequestsPage from "./pages/requests/ProfileImageUpdateRequestsPage";
import MyProposalsPage from "./pages/events/MyProposalsPage";
import ProposalApprovalPage from "./pages/events/ProposalApprovalPage";
import CreditsPage from "./pages/CreditsPage";
import RetrivalPage from "./pages/COE/RetrivalPage";
import LmsPage from "./pages/lms/LmsPage";
import FilePreviewPage from "./pages/lms/FilePreviewPage";

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
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  const canAccessCoePortal = (currentUser: Me | null) => {
    if (!currentUser) return false;
    const email = String(currentUser.email || "")
      .toLowerCase()
      .trim();
    const perms = (currentUser.permissions || []).map((p) =>
      String(p || "").toLowerCase(),
    );
    return email === "coe@krct.ac.in" || perms.includes("coe.portal.access");
  };

  const isBrandingUser = Boolean(
    user &&
    ((Array.isArray(user.roles) &&
      user.roles.some((r) => String(r || "").toUpperCase() === "BRANDING")) ||
      (Array.isArray(user.permissions) &&
        user.permissions.some(
          (p) => String(p || "").toLowerCase() === "branding.access",
        ))),
  );

  useEffect(() => {
    // Check if user has an access token before attempting to fetch profile
    const token = localStorage.getItem("access");
    if (!token) {
      // No token means user is not logged in, skip API call
      setUser(null);
      setLoading(false);
      return;
    }

    // Add a short timeout so the app doesn't stay on the Loading... screen
    // indefinitely if the backend is unavailable.
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn("getMe() timed out");
        setUser(null);
        setLoading(false);
      }
    }, 5000);

    getMe()
      .then((r) => {
        if (cancelled) return;
        // Normalize roles to string array and keep profile info
        const normalizedUser = {
          ...r,
          roles: Array.isArray(r.roles)
            ? r.roles.map((role: string | RoleObj) =>
                typeof role === "string" ? role : role.name,
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
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const onMeUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as Me | null | undefined;
      if (!detail) return;
      const normalizedUser = {
        ...detail,
        roles: Array.isArray(detail.roles)
          ? detail.roles.map((role: string | RoleObj) =>
              typeof role === "string" ? role : role.name,
            )
          : [],
        role: derivePrimaryRole(detail.roles as any),
        permissions: Array.isArray(detail.permissions)
          ? detail.permissions
          : [],
        profile_type: detail.profile_type || null,
        profile: detail.profile || null,
      };
      seedUCState((detail as any).under_construction || {});
      setUser(normalizedUser as Me);
    };

    window.addEventListener("idcs:me-updated", onMeUpdated as EventListener);
    return () =>
      window.removeEventListener(
        "idcs:me-updated",
        onMeUpdated as EventListener,
      );
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
      <Routes>
        <Route
          path="/branding/*"
          element={
            <ProtectedRoute
              user={user}
              requiredPermissions={["branding.access"]}
              element={<BrandingLayout user={user} />}
            />
          }
        />
        {/* Any other path → redirect into branding dashboard */}
        <Route path="*" element={<Navigate to="/branding" replace />} />
      </Routes>
    );
  }
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Navbar user={user} />
      {user ? (
        <div className="flex">
          <DashboardSidebar />
          <main
            className={`flex-1 min-w-0 transition-all duration-300 pt-20 overflow-x-hidden ${
              // Sidebar is `fixed`, so using `ml-*` here would increase total page width
              // (main still occupies full width, plus margin). Use `pl-*` instead.
              collapsed ? "lg:pl-20" : "lg:pl-64"
            }`}
          >
            <UCGate user={user}>
              <div className="app-main-zoom">
                <Routes>
                  <Route
                    path="/"
                    element={<Navigate to="/dashboard" replace />}
                  />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/credits" element={<CreditsPage />} />
                  <Route
                    path="/profile"
                    element={<ProfilePage user={user} />}
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<SettingsPage />}
                      />
                    }
                  />
                  <Route
                    path="/settings/whatsapp-sender"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<WhatsAppSenderPage />}
                      />
                    }
                  />
                  <Route
                    path="/settings/under-construction"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<UnderConstructionManagerPage />}
                      />
                    }
                  />
                  <Route
                    path="/settings/notification-templates"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<NotificationsPage />}
                      />
                    }
                  />
                  <Route
                    path="/settings/conditions"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<ConditionsPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/applications-admin"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<ApplicationsAdminPage />}
                      />
                    }
                  />
                  <Route path="/applications" element={<ApplicationsPage />} />
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
                    element={
                      canAccessCoePortal(user) ? (
                        <CoePortalPage user={user} />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/students"
                    element={
                      canAccessCoePortal(user) ? (
                        <StudentsList />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/courses"
                    element={
                      canAccessCoePortal(user) ? (
                        <CourseList />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/arrears"
                    element={
                      canAccessCoePortal(user) ? (
                        <ArrearList />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/bundle-allocation"
                    element={
                      canAccessCoePortal(user) ? (
                        <BundleAllocation />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/bundle-barcodes"
                    element={
                      canAccessCoePortal(user) ? (
                        <BundleBarcodeView />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/bar-scan"
                    element={
                      canAccessCoePortal(user) ? (
                        <BarScan />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/bar-scan/entry"
                    element={
                      canAccessCoePortal(user) ? (
                        <BarScanMarkEntry />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/retrival"
                    element={
                      canAccessCoePortal(user) ? (
                        <RetrivalPage />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route
                    path="/coe/one-page-report"
                    element={
                      canAccessCoePortal(user) ? (
                        <OnePageReport />
                      ) : (
                        <Navigate to="/dashboard" replace />
                      )
                    }
                  />
                  <Route path="/queries" element={<QueriesPage />} />
                  <Route
                    path="/notifications"
                    element={<NotificationsPage />}
                  />
                  <Route
                    path="/announcements"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={[
                          "announcements.view_announcement_page",
                        ]}
                        element={<AnnouncementsPage user={user} />}
                      />
                    }
                  />
                  <Route
                    path="/announcements/sent"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={[
                          "announcements.view_announcement_page",
                        ]}
                        element={<AnnouncementsPage user={user} />}
                      />
                    }
                  />
                  <Route
                    path="/lms"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={[
                          "STUDENT",
                          "STAFF",
                          "FACULTY",
                          "HOD",
                          "AHOD",
                          "IQAC",
                        ]}
                        requiredPermissions={[
                          "lms.page.student",
                          "lms.page.staff",
                          "lms.page.hod",
                          "lms.page.ahod",
                          "lms.page.iqac",
                        ]}
                        element={<LmsPage user={user} />}
                      />
                    }
                  />
                  <Route
                    path="/lms/preview/file/:materialId"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={[
                          "STUDENT",
                          "STAFF",
                          "FACULTY",
                          "HOD",
                          "AHOD",
                          "IQAC",
                        ]}
                        requiredPermissions={[
                          "lms.page.student",
                          "lms.page.staff",
                          "lms.page.hod",
                          "lms.page.ahod",
                          "lms.page.iqac",
                        ]}
                        element={<FilePreviewPage />}
                      />
                    }
                  />
                  <Route
                    path="/ps/staff-attendance/upload"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["PS", "IQAC"]}
                        element={<StaffAttendanceUpload />}
                      />
                    }
                  />
                  <Route
                    path="/feedback"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["feedback.feedback_page"]}
                        element={<FeedbackPage />}
                      />
                    }
                  />
                  <Route
                    path="/student/feedback"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STUDENT"}
                        requiredPermissions={["feedback.feedback_page"]}
                        element={<FeedbackPage />}
                      />
                    }
                  />
                  <Route
                    path="/academic-calendar"
                    element={<AcademicCalendarRedirect user={user} />}
                  />
                  <Route
                    path="/iqac/calendar"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<AcademicCalendarPage mode="iqac" />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/calendar/admin"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<AcademicCalendarAdmin />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/calendar/admin/view/:id"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<AcademicCalendarView />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/calendar/events"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<CalendarEvents />}
                      />
                    }
                  />
                  <Route
                    path="/hod/calendar"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD"]}
                        element={<AcademicCalendarPage mode="hod" />}
                      />
                    }
                  />
                  <Route
                    path="/student/calendar"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STUDENT"}
                        element={<AcademicCalendarPage mode="student" />}
                      />
                    }
                  />
                  <Route
                    path="/import/questions"
                    element={<QuestionImportPage />}
                  />
                  <Route path="/curriculum/master" element={<MasterList />} />
                  <Route
                    path="/curriculum/master/:id"
                    element={<MasterEditor />}
                  />
                  <Route
                    path="/curriculum/master/new"
                    element={<MasterEditor />}
                  />
                  <Route path="/curriculum/department" element={<DeptList />} />

                  <Route
                    path="/curriculum/elective-import"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={[
                          "curriculum.import_elective_choices",
                        ]}
                        element={<ElectiveImport />}
                      />
                    }
                  />

                  {/* OBE/marks/COAttainment routes removed */}
                  <Route path="/obe" element={<OBEPage />} />
                  <Route
                    path="/obe/course/:code/lca/cotarget"
                    element={<COTargetPageWrapper />}
                  />
                  <Route
                    path="/obe/course/:code/*"
                    element={<CourseOBEPage />}
                  />
                  <Route
                    path="/obe/request"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        element={<OBERequestPage />}
                      />
                    }
                  />
                  <Route
                    path="/obe/master/requests"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["obe.master_obe_requests"]}
                        element={<OBERequestsPage />}
                      />
                    }
                  />
                  <Route
                    path="/obe/master/due-dates"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["obe.master.manage"]}
                        element={<OBEDueDatesPage />}
                      />
                    }
                  />
                  <Route path="/academic" element={<AcademicPage />} />

                  <Route
                    path="/hod/advisors"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD"]}
                        requiredPermissions={["academics.assign_advisor"]}
                        element={<AdvisorAssignments />}
                      />
                    }
                  />
                  <Route
                    path="/hod/obe-requests"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["obe.hod_obe_requests"]}
                        element={<ObeEditRequestsPage />}
                      />
                    }
                  />
                  <Route
                    path="/hod/result-analysis"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD", "ADVISOR"]}
                        element={<HodResultAnalysisPage />}
                      />
                    }
                  />
                  <Route
                    path="/hod/events"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD"]}
                        element={<HodEventsListPage />}
                      />
                    }
                  />
                  <Route
                    path="/hod/events/create"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD"]}
                        element={<HodEventCreatePage />}
                      />
                    }
                  />
                  <Route
                    path="/hod/events/canva-editor"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD"]}
                        element={<CanvaDesignEditorPage />}
                      />
                    }
                  />
                  {/* Canva Poster Maker — accessible to HOD, IQAC, and STAFF */}
                  <Route
                    path="/poster-maker"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD", "IQAC", "STAFF"]}
                        element={<PosterMakerPage />}
                      />
                    }
                  />
                  {/* ── Event Proposal Workflow Routes ─────────────────────────────── */}
                  <Route
                    path="/events/create-event"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["events.create_proposal"]}
                        element={<PosterMakerPage staffMode />}
                      />
                    }
                  />
                  <Route
                    path="/events/my-proposals"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["events.create_proposal"]}
                        element={<MyProposalsPage />}
                      />
                    }
                  />
                  <Route
                    path="/hod/event-approvals"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["events.hod_approve"]}
                        element={<ProposalApprovalPage role="hod" />}
                      />
                    }
                  />
                  <Route
                    path="/haa/event-approvals"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["events.haa_approve"]}
                        element={<ProposalApprovalPage role="haa" />}
                      />
                    }
                  />
                  <Route
                    path="/hod/staff-attendance"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD"]}
                        element={<HODStaffAttendancePage />}
                      />
                    }
                  />
                  <Route
                    path="/staffs"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["PS"]}
                        requiredPermissions={["academics.view_staffs_page"]}
                        element={<StaffsPage />}
                      />
                    }
                  />
                  <Route
                    path="/advisor/teaching"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["ADVISOR"]}
                        requiredPermissions={["academics.assign_teaching"]}
                        element={<TeachingAssignmentsPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/timetable"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["timetable.manage_templates"]}
                        element={<HodTimetableEditor />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/event-approvals"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["obe.master.manage"]}
                        element={<IQACEventApprovalPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/academic-controller"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        requiredPermissions={["obe.master.manage"]}
                        element={<AcademicControllerPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/academic-controller/course/:courseCode"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        requiredPermissions={["obe.master.manage"]}
                        element={<AcademicControllerCoursePage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/academic-controller/course/:courseCode/marks/:taId"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        requiredPermissions={["obe.master.manage"]}
                        element={<AcademicControllerCourseMarksPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/academic-controller/course/:courseCode/internal-mark/:taId"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        requiredPermissions={["obe.master.manage"]}
                        element={<InternalMarkPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/academic-controller/course/:courseCode/obe/:taId/*"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        requiredPermissions={["obe.master.manage"]}
                        element={<AcademicControllerCourseOBEPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/obe-requests"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={["obe.master_obe_requests"]}
                        element={<ObeRequestsPage />}
                      />
                    }
                  />
                  {/* PBAS IQAC route removed */}
                  <Route
                    path="/faculty/attendance"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<FacultyAttendancePage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/staff-attendance"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<FacultyAttendancePage />}
                      />
                    }
                  />
                  <Route
                    path="/ps/staff-attendance/view"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["PS", "ADMIN"]}
                        element={<PSStaffAttendanceViewPage />}
                      />
                    }
                  />
                  {/* ── IDCSScan (SECURITY / ADMIN) ─────────────────────────── */}
                  <Route
                    path="/idscan/test"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["SECURITY"]}
                        element={<IDCSScanTestPage />}
                      />
                    }
                  />
                  <Route
                    path="/idscan/assign-cards"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["SECURITY", "LIBRARY"]}
                        element={<RFReaderAssignCardsPage />}
                      />
                    }
                  />
                  <Route
                    path="/idscan/cards-data"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["LIBRARY", "SECURITY", "IQAC", "ADMIN"]}
                        element={<RFReaderCardsDataPage />}
                      />
                    }
                  />
                  <Route
                    path="/idscan/bulk-entry"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["LIBRARY", "SECURITY", "IQAC", "ADMIN"]}
                        element={<BulkEntryPage />}
                      />
                    }
                  />
                  <Route
                    path="/idscan/gatepass"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["SECURITY"]}
                        element={<IDCSScanGatepassPage />}
                      />
                    }
                  />
                  <Route
                    path="/idscan/gatescan"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["SECURITY"]}
                        element={<RFReaderGateScanPage />}
                      />
                    }
                  />
                  <Route
                    path="/idscan/fingerprint"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["LIBRARY", "SECURITY", "IQAC", "ADMIN"]}
                        element={<FingerprintEnrollPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/rf-reader"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={
                          <Navigate to="/iqac/rf-reader/create-gate" replace />
                        }
                      />
                    }
                  />
                  <Route
                    path="/iqac/rf-reader/create-gate"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<RFReaderCreateGatePage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/rf-reader/test-students"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<RFReaderTestStudentsPage />}
                      />
                    }
                  />
                  <Route
                    path="/iqac/rf-reader/add-students-rf"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<RFReaderAddStudentsRFPage />}
                      />
                    }
                  />
                  <Route
                    path="/advisor/timetable"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["ADVISOR"]}
                        requiredPermissions={["timetable.assign"]}
                        element={<TimetableEditor />}
                      />
                    }
                  />
                  <Route
                    path="/advisor/mentor"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["ADVISOR"]}
                        requiredPermissions={["academics.assign_mentor"]}
                        element={<MentorAssign />}
                      />
                    }
                  />
                  <Route
                    path="/student/timetable"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STUDENT"}
                        requiredPermissions={["timetable.view"]}
                        element={<StudentTimetable />}
                      />
                    }
                  />
                  <Route
                    path="/student/attendance"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STUDENT"}
                        element={<StudentAttendancePage />}
                      />
                    }
                  />
                  <Route
                    path="/student/academics"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STUDENT"}
                        element={<StudentAcademics />}
                      />
                    }
                  />
                  {/* Student PBAS route removed */}
                  {/* Attendance pages removed */}
                  <Route
                    path="/staff/timetable"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        requiredPermissions={["timetable.view"]}
                        element={<StaffTimetable />}
                      />
                    }
                  />
                  <Route
                    path="/staff/assigned-subjects"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        requiredPermissions={[
                          "academics.view_assigned_subjects",
                        ]}
                        element={<AssignedSubjectsPage />}
                      />
                    }
                  />
                  <Route
                    path="/staff/students"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        requiredPermissions={["students.view_students"]}
                        element={<StudentsPage user={user} />}
                      />
                    }
                  />
                  {/* Staff PBAS route removed */}
                  <Route
                    path="/staff/period-attendance"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        requiredPermissions={["academics.mark_attendance"]}
                        element={<PeriodAttendance />}
                      />
                    }
                  />

                  <Route
                    path="/staff/analytics"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD", "IQAC"]}
                        requiredPermissions={[
                          "academics.view_all_attendance",
                          "academics.view_attendance_overall",
                          "academics.view_all_departments",
                          "academics.view_department_attendance",
                          "academics.view_class_attendance",
                          "academics.view_section_attendance",
                        ]}
                        element={<AttendanceAnalytics />}
                      />
                    }
                  />
                  <Route
                    path="/staff/my-attendance"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        element={<MyAttendance />}
                      />
                    }
                  />
                  <Route
                    path="/staff/salary"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        element={<SalaryPage />}
                      />
                    }
                  />

                  {/* HR Routes */}
                  <Route
                    path="/hr/request-templates"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HR"]}
                        requiredPermissions={[
                          "staff_requests.manage_templates",
                        ]}
                        element={<RequestTemplatesPage />}
                      />
                    }
                  />
                  <Route
                    path="/hr/staff-attendance-analytics"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HR"]}
                        requiredPermissions={[
                          "staff_requests.manage_templates",
                        ]}
                        element={<OrganizationStaffAttendanceAnalytics />}
                      />
                    }
                  />
                  <Route
                    path="/hr/manage-gate"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HR", "SECURITY"]}
                        element={<ManageGatePage />}
                      />
                    }
                  />
                  <Route
                    path="/hr/gatepass-logs"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HR"]}
                        element={<GatePassLogsPage />}
                      />
                    }
                  />
                  <Route
                    path="/hr/staff-validation"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HR"]}
                        requiredPermissions={[
                          "staff_requests.manage_templates",
                        ]}
                        element={<StaffValidationPage />}
                      />
                    }
                  />
                  <Route
                    path="/hr/staff-salary"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HR"]}
                        requiredPermissions={[
                          "staff_requests.manage_templates",
                        ]}
                        element={<StaffSalaryPage />}
                      />
                    }
                  />

                  <Route
                    path="/iqac/external-management"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["IQAC"]}
                        element={<ExtStaffProfilesPage />}
                      />
                    }
                  />

                  {/* Staff Requests Routes */}
                  <Route
                    path="/staff-requests/my-requests"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        element={<MyRequestsPage />}
                      />
                    }
                  />
                  <Route
                    path="/staff-requests/pending-approvals"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={[
                          "HOD",
                          "AHOD",
                          "HR",
                          "HAA",
                          "IQAC",
                          "PS",
                          "PRINCIPAL",
                          "ADMIN",
                        ]}
                        requiredPermissions={[
                          "staff_requests.approve_requests",
                        ]}
                        element={<PendingApprovalsPage />}
                      />
                    }
                  />

                  <Route
                    path="/attendance-analytics/requests"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredRoles={["HOD", "IQAC"]}
                        element={<AttendanceAnalyticsRequestsPage />}
                      />
                    }
                  />
                  <Route
                    path="/requests"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredProfile={"STAFF"}
                        element={<RequestsPage user={user} />}
                      />
                    }
                  />
                  <Route
                    path="/requests/profile-image-update"
                    element={
                      <ProtectedRoute
                        user={user}
                        requiredPermissions={[
                          "accounts.profile_image_unlock_approve",
                        ]}
                        element={<ProfileImageUpdateRequestsPage />}
                      />
                    }
                  />
                  <Route
                    path="*"
                    element={
                      user ? (
                        <Navigate to="/dashboard" replace />
                      ) : (
                        <HomePage user={user} />
                      )
                    }
                  />
                  {/* Prevent regular users from accessing Branding-only routes */}
                  <Route
                    path="/branding/*"
                    element={<Navigate to="/dashboard" replace />}
                  />
                </Routes>
              </div>
            </UCGate>
          </main>
        </div>
      ) : (
        <div className={isHomePage ? "" : "pt-16"}>
          <Routes>
            <Route
              path="/"
              element={
                user ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <HomePage user={user} />
                )
              }
            />
            <Route path="/credits" element={<CreditsPage />} />
            <Route
              path="*"
              element={
                user ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <HomePage user={user} />
                )
              }
            />
          </Routes>
        </div>
      )}
    </div>
  );
}

function COTargetPageWrapper() {
  const { code } = useParams<{ code: string }>();
  const courseCode = code ? decodeURIComponent(code) : undefined;
  return <COTargetPage courseCode={courseCode} />;
}
