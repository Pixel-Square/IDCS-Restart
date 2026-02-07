import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getMe } from "./services/auth";
import Navbar from "./components/Navbar";
import DashboardSidebar from './components/DashboardSidebar';
import TimetableEditor from './pages/advisor/TimetableEditor';
import HodTimetableEditor from './pages/iqac/TimetableEditor';
import ObeRequestsPage from './pages/iqac/ObeRequestsPage';
import OBERequestsPage from './pages/OBERequestsPage';
import OBEDueDatesPage from './pages/OBEDueDatesPage';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from "./components/HomePage";
import DashboardPage from "./pages/Dashboard";
import ProfilePage from "./pages/Profile";
import MasterList from './pages/curriculum/MasterList';
import MasterEditor from './pages/curriculum/MasterEditor';
import DeptList from './pages/curriculum/DeptList';
import AcademicPage from './pages/AcademicPage';
import QuestionImportPage from "./pages/QuestionImportPage";
import OBEPage from './pages/OBEPage';
import CourseOBEPage from './pages/CourseOBEPage';
import OBERequestPage from './pages/OBERequestPage';
import AdvisorAssignments from './pages/hod/AdvisorAssignments';
import TeachingAssignmentsPage from './pages/hod/TeachingAssignments';
import MyStudentsPage from './pages/advisor/MyStudents';
import StudentTimetable from './pages/student/TimetableView';
import StaffTimetable from './pages/staff/TimetableView';
import AssignedSubjectsPage from './pages/staff/AssignedSubjects';
import PeriodAttendance from './pages/staff/PeriodAttendance';
import StudentAttendancePage from './pages/student/Attendance';

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

  useEffect(() => {
    getMe()
        .then((r) => {
        // Normalize roles to string array and keep profile info
        const normalizedUser = {
          ...r,
          roles: Array.isArray(r.roles)
            ? r.roles.map((role: string | RoleObj) =>
                typeof role === "string" ? role : role.name,
              )
            : [],
          permissions: Array.isArray(r.permissions) ? r.permissions : [],
          profile_type: r.profile_type || null,
          profile: r.profile || null,
        };
        setUser(normalizedUser as Me);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  const userPerms = Array.isArray(user?.permissions) ? user?.permissions : [];
  const lowerPerms = userPerms.map((p) => String(p || '').toLowerCase());
  // const canObeMaster = lowerPerms.includes('obe.master.manage');

  return (
    <div>
      <Navbar user={user} />
      {user ? (
        <div className="dashboard-root">
          <DashboardSidebar />
          <main className="dashboard-main">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/profile" element={<ProfilePage user={user} />} />
              <Route path="/import/questions" element={<QuestionImportPage />} />
              <Route path="/curriculum/master" element={<MasterList />} />
              <Route path="/curriculum/master/:id" element={<MasterEditor />} />
              <Route path="/curriculum/master/new" element={<MasterEditor />} />
              <Route path="/curriculum/department" element={<DeptList />} />
              {/* OBE/marks/COAttainment routes removed */}
              <Route path="/obe" element={<OBEPage />} />
              <Route path="/obe/course/:code/*" element={<CourseOBEPage />} />
              <Route
                path="/obe/request"
                element={<ProtectedRoute user={user} requiredProfile={'STAFF'} element={<OBERequestPage />} />}
              />
              <Route path="/obe/master/requests" element={<ProtectedRoute user={user} requiredPermissions={["obe.master.manage"]} element={<OBERequestsPage />} />} />
              <Route path="/obe/master/due-dates" element={<ProtectedRoute user={user} requiredPermissions={["obe.master.manage"]} element={<OBEDueDatesPage />} />} />
              <Route path="/academic" element={<AcademicPage />} />
              <Route path="/hod/advisors" element={
                <ProtectedRoute user={user} requiredRoles={["HOD"]} requiredPermissions={["academics.assign_advisor"]} element={<AdvisorAssignments />} />
              } />
              <Route path="/advisor/teaching" element={
                <ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.assign_teaching"]} element={<TeachingAssignmentsPage />} />
              } />
              <Route path="/iqac/timetable" element={
                <ProtectedRoute user={user} requiredPermissions={["timetable.manage_templates"]} element={<HodTimetableEditor />} />
              } />
              <Route
                path="/iqac/obe-requests"
                element={<ProtectedRoute user={user} requiredPermissions={["obe.master.manage"]} element={<ObeRequestsPage />} />}
              />
              <Route path="/advisor/timetable" element={
                <ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["timetable.assign"]} element={<TimetableEditor />} />
              } />
              <Route path="/advisor/students" element={
                <ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.view_my_students"]} element={<MyStudentsPage />} />
              } />
              <Route path="/student/timetable" element={
                <ProtectedRoute user={user} requiredProfile={'STUDENT'} requiredPermissions={["timetable.view"]} element={<StudentTimetable />} />
              } />
              <Route path="/student/attendance" element={
                <ProtectedRoute user={user} requiredProfile={'STUDENT'} element={<StudentAttendancePage />} />
              } />
              {/* Attendance pages removed */}
              <Route path="/staff/timetable" element={
                <ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={["timetable.view"]} element={<StaffTimetable />} />
              } />
              <Route path="/staff/assigned-subjects" element={
                <ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={["academics.view_assigned_subjects"]} element={<AssignedSubjectsPage />} />
              } />
              <Route path="/staff/period-attendance" element={
                <ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={['academics.mark_attendance']} element={<PeriodAttendance />} />
              } />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="*" element={<HomePage user={user} />} />
        </Routes>
      )}
    </div>
  );
}
