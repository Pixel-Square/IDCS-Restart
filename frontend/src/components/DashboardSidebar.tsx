import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import useDashboard from '../hooks/useDashboard';
import { User, BookOpen, Layout, Grid, Home, GraduationCap, Users, Calendar, ClipboardList, FileText } from 'lucide-react';
import { useSidebar } from './SidebarContext';

const ICON_MAP: Record<string, any> = {
  profile: User,
  curriculum_master: BookOpen,
  assigned_subjects: BookOpen,
  department_curriculum: Layout,
  student_curriculum_view: Grid,
  home: Home,
  hod_advisors: Users,
  hod_teaching: BookOpen,
  advisor_students: GraduationCap,
  mentor_assign: Users,
  timetable_templates: Calendar,
  timetable_assignments: Calendar,
  student_timetable: Calendar,
  staff_timetable: Calendar,
  student_attendance: ClipboardList,
  my_mentees: Users,
  period_attendance: ClipboardList,
};

export default function DashboardSidebar({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error } = useDashboard(baseUrl);
  const loc = useLocation();
  const { collapsed, toggle } = useSidebar();

  if (loading) return (
    <aside className={`fixed top-16 left-0 h-[calc(100vh-4rem)] bg-white shadow-lg transition-all duration-300 z-30 ${collapsed ? '-translate-x-full lg:translate-x-0 lg:w-20' : 'w-full lg:w-64'}`}>
      <div className="p-6 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    </aside>
  );
  
  if (error) return (
    <aside className={`fixed top-16 left-0 h-[calc(100vh-4rem)] bg-white shadow-lg transition-all duration-300 z-30 ${collapsed ? '-translate-x-full lg:translate-x-0 lg:w-20' : 'w-full lg:w-64'}`}>
      <div className="p-6 text-red-600 text-sm">Error loading sidebar</div>
    </aside>
  );
  
  if (!data) return null;

  const entry = data.entry_points || {};

  const items: Array<{ key: string; label: string; to: string }> = [];
  const permsLower = (data.permissions || []).map(p => (p || '').toString().toLowerCase());
  const rolesUpper = (data.roles || []).map(r => (r || '').toString().toUpperCase());
  const flags = data.flags || {};

  // Curriculum master/department: require explicit curriculum permissions if present, otherwise rely on entry point
  if (entry.curriculum_master && (permsLower.some(p => p.includes('curriculum')) || entry.curriculum_master)) items.push({ key: 'curriculum_master', label: 'Curriculum Master', to: '/curriculum/master' });
  if (entry.department_curriculum && (permsLower.some(p => p.includes('curriculum')) || entry.department_curriculum)) items.push({ key: 'department_curriculum', label: 'Department Curriculum', to: '/curriculum/department' });

  // HOD pages: require HOD role or explicit permission
  if (entry.hod_advisors && (rolesUpper.includes('HOD') || permsLower.includes('academics.assign_advisor'))) items.push({ key: 'hod_advisors', label: 'Advisor Assign', to: '/hod/advisors' });
  if (entry.hod_teaching && (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.assign_teaching'))) items.push({ key: 'hod_teaching', label: 'Teaching Assign', to: '/advisor/teaching' });

  // Advisor pages: require ADVISOR role or explicit permission
  if (entry.advisor_students && (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.view_my_students'))) items.push({ key: 'advisor_students', label: 'My Students', to: '/advisor/students' });
  // Mentor assignment: advisors with assign permission
  if (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.assign_mentor')) items.push({ key: 'mentor_assign', label: 'Mentor Assign', to: '/advisor/mentor' });

  if (entry.student_curriculum_view && permsLower.some(p => p.includes('curriculum'))) items.push({ key: 'student_curriculum_view', label: 'My Curriculum', to: '/curriculum/student' });

  // Timetable-related entries: require explicit timetable permissions or flags/roles
  if ((flags.can_manage_timetable_templates || permsLower.includes('timetable.manage_templates')) && entry.timetable_templates) items.push({ key: 'timetable_templates', label: 'IQAC: Timetable Templates', to: '/iqac/timetable' });
  const canAssignTimetable = Boolean(flags.can_assign_timetable) || permsLower.includes('timetable.assign') || rolesUpper.includes('ADVISOR')
  if (canAssignTimetable && entry.timetable_assignments) items.push({ key: 'timetable_assignments', label: 'Timetable Assignments', to: '/advisor/timetable' });

  // show student/staff personal timetable based on explicit 'timetable.view' permission and profile flags
  if (flags.can_view_timetable && flags.is_student && permsLower.includes('timetable.view')) items.push({ key: 'student_timetable', label: 'My Timetable', to: '/student/timetable' });
  if (flags.can_view_timetable && flags.is_staff && permsLower.includes('timetable.view')) items.push({ key: 'staff_timetable', label: 'My Timetable (Staff)', to: '/staff/timetable' });

  // Student: show My Attendance link for students
  if (flags.is_student) {
    items.push({ key: 'student_attendance', label: 'My Attendance', to: '/student/attendance' });
  }

  // Staff assigned subjects page
  if (flags.is_staff && (permsLower.includes('academics.view_assigned_subjects') || rolesUpper.includes('HOD'))) {
    items.push({ key: 'assigned_subjects', label: 'Assigned Subjects', to: '/staff/assigned-subjects' });
  }

  // Staff: view my mentees
  if (flags.is_staff) items.push({ key: 'my_mentees', label: 'My Mentees', to: '/staff/mentees' });

  // Period attendance for staff
  if (flags.is_staff && (permsLower.includes('academics.mark_attendance') || rolesUpper.includes('HOD') || rolesUpper.includes('ADVISOR'))) {
    items.push({ key: 'period_attendance', label: 'Mark Attendance', to: '/staff/period-attendance' });
  }

  // fallback: always show profile
  items.unshift({ key: 'profile', label: 'Profile', to: '/profile' });

  return (
    <>
      {/* Mobile overlay backdrop */}
      {!collapsed && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={toggle}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-16 left-0 h-[calc(100vh-4rem)] bg-white shadow-lg transition-all duration-300 z-30 overflow-y-auto ${
        collapsed ? '-translate-x-full lg:translate-x-0 lg:w-20' : 'w-full lg:w-64'
      }`}>
        {/* Header - Hidden */}
        <div className="hidden"></div>

        {/* Navigation Links */}
        <nav className="py-6">
          <ul className="space-y-2 px-3">
            {/* Dashboard Link */}
            <li>
              <Link
                to="/dashboard"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${
                  loc.pathname === '/dashboard'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
                onClick={() => { if (window.innerWidth < 1024) toggle(); }}
              >
                <Home className={`flex-shrink-0 ${collapsed ? 'lg:w-5 lg:h-5' : 'w-6 h-6'}`} />
                <span className={`font-medium text-base ${collapsed ? 'lg:hidden' : ''}`}>Dashboard</span>
              </Link>
            </li>

            {/* Dynamic Menu Items */}
            {items.map(i => {
              const Icon = ICON_MAP[i.key] || User;
              const active = loc.pathname.startsWith(i.to);
              return (
                <li key={i.key}>
                  <Link
                    to={i.to}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${
                      active
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                    } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
                    onClick={() => { if (window.innerWidth < 1024) toggle(); }}
                  >
                    <Icon className={`flex-shrink-0 ${collapsed ? 'lg:w-5 lg:h-5' : 'w-6 h-6'}`} />
                    <span className={`font-medium text-base ${collapsed ? 'lg:hidden' : ''}`}>{i.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
