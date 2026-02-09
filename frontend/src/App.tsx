import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getMe } from "./services/auth";
import Navbar from "./components/Navbar";
import DashboardSidebar from './components/DashboardSidebar';
import { useSidebar } from './components/SidebarContext';
import TimetableEditor from './pages/advisor/TimetableEditor';
import HodTimetableEditor from './pages/iqac/TimetableEditor';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from "./components/HomePage";
import DashboardPage from "./pages/Dashboard";
import ProfilePage from "./pages/Profile";
import MasterList from './pages/curriculum/MasterList';
import MasterEditor from './pages/curriculum/MasterEditor';
import DeptList from './pages/curriculum/DeptList';
import AdvisorAssignments from './pages/hod/AdvisorAssignments';
import TeachingAssignmentsPage from './pages/hod/TeachingAssignments';
import MyStudentsPage from './pages/advisor/MyStudents';
import StudentTimetable from './pages/student/TimetableView';
import StaffTimetable from './pages/staff/TimetableView';
import AssignedSubjectsPage from './pages/staff/AssignedSubjects';
import PeriodAttendance from './pages/staff/PeriodAttendance';
import AttendanceAnalytics from './pages/staff/AttendanceAnalytics';
import StudentAttendancePage from './pages/student/Attendance';
import MentorAssign from './pages/advisor/MentorAssign';
import MyMentees from './pages/staff/MyMentees';

type RoleObj = { name: string };
type Me = {
  id: number;
  username: string;
  email?: string;
  roles?: string[] | RoleObj[];
  permissions?: string[];
};

export default function App() {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { collapsed } = useSidebar();

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
          <main className={`flex-1 transition-all duration-300 pt-20 overflow-x-hidden ${
            collapsed ? 'lg:ml-20' : 'lg:ml-64'
          }`}>
            <Routes>
              <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <HomePage user={user} />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/profile" element={<ProfilePage user={user} />} />
              <Route path="/curriculum/master" element={<MasterList />} />
              <Route path="/curriculum/master/:id" element={<MasterEditor />} />
              <Route path="/curriculum/master/new" element={<MasterEditor />} />
              <Route path="/curriculum/department" element={<DeptList />} />
              <Route path="/hod/advisors" element={
                <ProtectedRoute user={user} requiredRoles={["HOD"]} requiredPermissions={["academics.assign_advisor"]} element={<AdvisorAssignments />} />
              } />
              <Route path="/advisor/teaching" element={
                <ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.assign_teaching"]} element={<TeachingAssignmentsPage />} />
              } />
              <Route path="/iqac/timetable" element={
                <ProtectedRoute user={user} requiredPermissions={["timetable.manage_templates"]} element={<HodTimetableEditor />} />
              } />
              <Route path="/advisor/timetable" element={
                <ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["timetable.assign"]} element={<TimetableEditor />} />
              } />
              <Route path="/advisor/students" element={
                <ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.view_my_students"]} element={<MyStudentsPage />} />
              } />
              <Route path="/advisor/mentor" element={
                <ProtectedRoute user={user} requiredRoles={["ADVISOR"]} requiredPermissions={["academics.assign_mentor"]} element={<MentorAssign />} />
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
              <Route path="/staff/analytics" element={
                <ProtectedRoute user={user} requiredProfile={'STAFF'} requiredPermissions={['analytics.view_all_analytics', 'analytics.view_department_analytics', 'analytics.view_class_analytics']} element={<AttendanceAnalytics />} />
              } />
              <Route path="/staff/mentees" element={
                <ProtectedRoute user={user} requiredProfile={'STAFF'} element={<MyMentees />} />
              } />
              <Route path="*" element={user ? <Navigate to="/dashboard" replace /> : <HomePage user={user} />} />
            </Routes>
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
