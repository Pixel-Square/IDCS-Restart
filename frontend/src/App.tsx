import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getMe } from "./services/auth";
import Navbar from "./components/Navbar";
import DashboardSidebar from './components/DashboardSidebar';
import { useSidebar } from './components/SidebarContext';
import TimetableEditor from './pages/advisor/TimetableEditor';
import HodTimetableEditor from './pages/iqac/TimetableEditor';
import ObeRequestsPage from './pages/iqac/ObeRequestsPage';
import AcademicControllerPage from './pages/iqac/AcademicControllerPage';
import AcademicControllerCoursePage from './pages/iqac/AcademicControllerCoursePage';
import AcademicControllerCourseMarksPage from './pages/iqac/AcademicControllerCourseMarksPage';
import AcademicControllerCourseOBEPage from './pages/iqac/AcademicControllerCourseOBEPage';
import InternalMarkPage from './pages/iqac/InternalMarkPage';
import OBERequestsPage from './pages/OBERequestsPage';
import OBEDueDatesPage from './pages/OBEDueDatesPage';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from "./components/HomePage";
import DashboardPage from "./pages/Dashboard";
import ProfilePage from "./pages/Profile";
import MasterList from './pages/curriculum/MasterList';
import MasterEditor from './pages/curriculum/MasterEditor';
import DeptList from './pages/curriculum/DeptList';
import ElectiveImport from './pages/curriculum/ElectiveImport';
import AcademicPage from './pages/AcademicPage';
import QuestionImportPage from "./pages/QuestionImportPage";
import OBEPage from './pages/OBEPage';
import CourseOBEPage from './pages/CourseOBEPage';
import COTargetPage from './pages/COTargetPage';
import { useParams } from 'react-router-dom';
import OBERequestPage from './pages/OBERequestPage';
import AdvisorAssignments from './pages/hod/AdvisorAssignments';
import TeachingAssignmentsPage from './pages/hod/TeachingAssignments';
import ObeEditRequestsPage from './pages/hod/ObeEditRequestsPage';
import MyStudentsPage from './pages/advisor/MyStudents';
import StudentTimetable from './pages/student/TimetableView';
import StaffTimetable from './pages/staff/TimetableView';
import AssignedSubjectsPage from './pages/staff/AssignedSubjects';
import PeriodAttendance from './pages/staff/PeriodAttendance';
import AttendanceAnalytics from './pages/staff/AttendanceAnalytics';
import StudentAttendancePage from './pages/student/Attendance';
import StudentAcademics from './pages/student/Academics';
import MentorAssign from './pages/advisor/MentorAssign';
import MyMentees from './pages/staff/MyMentees';
import NotificationsPage from './pages/Notifications';

type RoleObj = { name: string };
type Me = {
  id: number;
  username: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  profile_type?: string | null;
  profile?: any | null;
};

export default function App() {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { collapsed } = useSidebar();

  useEffect(() => {
    // Add a short timeout so the app doesn't stay on the Loading... screen
    // indefinitely if the backend is unavailable.
    let cancelled = false
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('getMe() timed out')
        setUser(null)
        setLoading(false)
      }
    }, 5000)

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
          permissions: Array.isArray(r.permissions) ? r.permissions : [],
          profile_type: r.profile_type || null,
          profile: r.profile || null,
        };
        setUser(normalizedUser as Me);
      })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) { clearTimeout(timeout); setLoading(false) } })

    return () => { cancelled = true; clearTimeout(timeout) }
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

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
              collapsed ? 'lg:pl-20' : 'lg:pl-64'
            }`}
          >
            <div className="app-main-zoom">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage user={user} />} />
                <Route path="/notifications" element={<NotificationsPage />} />
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
                <Route path="/obe/master/requests" element={<ProtectedRoute user={user} requiredPermissions={["obe.master.manage"]} element={<OBERequestsPage />} />} />
                <Route path="/obe/master/due-dates" element={<ProtectedRoute user={user} requiredPermissions={["obe.master.manage"]} element={<OBEDueDatesPage />} />} />
                <Route path="/academic" element={<AcademicPage />} />

                <Route
                  path="/hod/advisors"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD"]} requiredPermissions={["academics.assign_advisor"]} element={<AdvisorAssignments />} />}
                />
                <Route
                  path="/hod/obe-requests"
                  element={<ProtectedRoute user={user} requiredRoles={["HOD"]} requiredPermissions={["academics.assign_advisor"]} element={<ObeEditRequestsPage />} />}
                />
                <Route
                  path="/advisor/teaching"
                  element={<ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.assign_teaching"]} element={<TeachingAssignmentsPage />} />}
                />
                <Route
                  path="/iqac/timetable"
                  element={<ProtectedRoute user={user} requiredPermissions={["timetable.manage_templates"]} element={<HodTimetableEditor />} />}
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
                  path="/iqac/academic-controller/course/:courseCode/internal-mark/:taId"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<InternalMarkPage />} />}
                />
                <Route
                  path="/iqac/academic-controller/course/:courseCode/obe/:taId/*"
                  element={<ProtectedRoute user={user} requiredRoles={["IQAC"]} requiredPermissions={["obe.master.manage"]} element={<AcademicControllerCourseOBEPage />} />}
                />
                <Route
                  path="/iqac/obe-requests"
                  element={<ProtectedRoute user={user} requiredPermissions={["obe.master.manage"]} element={<ObeRequestsPage />} />}
                />
                <Route
                  path="/advisor/timetable"
                  element={<ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["timetable.assign"]} element={<TimetableEditor />} />}
                />
                <Route
                  path="/advisor/students"
                  element={<ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.view_my_students"]} element={<MyStudentsPage />} />}
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
                  path="/staff/period-attendance"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={['academics.mark_attendance']} element={<PeriodAttendance />} />}
                />

                <Route
                  path="/staff/analytics"
                  element={
                    <ProtectedRoute
                      user={user}
                      requiredProfile={'STAFF'}
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
                  path="/staff/mentees"
                  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={['academics.view_mentees']} element={<MyMentees />} />}
                />
                <Route path="*" element={user ? <Navigate to="/dashboard" replace /> : <HomePage user={user} />} />
              </Routes>
            </div>
          </main>
        </div>
      ) : (
        <div className="pt-16">
          <Routes>
            <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <HomePage user={user} />} />
            <Route path="*" element={user ? <Navigate to="/dashboard" replace /> : <HomePage user={user} />} />
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
