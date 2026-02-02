import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import useDashboard from '../hooks/useDashboard';
import { User, BookOpen, Layout, Grid, Home } from 'lucide-react';
import './DashboardSidebar.css';
import { useSidebar } from './SidebarContext';

const ICON_MAP: Record<string, any> = {
  profile: User,
  curriculum_master: BookOpen,
    assigned_subjects: BookOpen,
  department_curriculum: Layout,
  student_curriculum_view: Grid,
  home: Home,
};

export default function DashboardSidebar({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error } = useDashboard(baseUrl);
  const loc = useLocation();
  const { collapsed } = useSidebar();

  if (loading) return <aside className="dsb">Loading…</aside>;
  if (error) return <aside className="dsb">Error loading sidebar</aside>;
  if (!data) return <aside className="dsb">No data</aside>;

  const entry = data.entry_points || {};

  const items: Array<{ key: string; label: string; to: string }> = [];
  const permsLower = (data.permissions || []).map(p => (p || '').toString().toLowerCase());
  const rolesUpper = (data.roles || []).map(r => (r || '').toString().toUpperCase());
  const flags = data.flags || {};

  // Curriculum master/department: require explicit curriculum permissions if present, otherwise rely on entry point
  if (entry.curriculum_master && (permsLower.some(p => p.includes('curriculum')) || entry.curriculum_master)) items.push({ key: 'curriculum_master', label: 'Curriculum Master', to: '/curriculum/master' });
  if (entry.department_curriculum && (permsLower.some(p => p.includes('curriculum')) || entry.department_curriculum)) items.push({ key: 'department_curriculum', label: 'Department Curriculum', to: '/curriculum/department' });

  // HOD pages: require HOD role or explicit permission
  if (entry.hod_advisors && (rolesUpper.includes('HOD') || permsLower.includes('academics.assign_advisor'))) items.push({ key: 'hod_advisors', label: 'Advisor Assignments', to: '/hod/advisors' });
  if (entry.hod_teaching && (rolesUpper.includes('HOD') || permsLower.includes('academics.assign_teaching'))) items.push({ key: 'hod_teaching', label: 'Teaching Assignments', to: '/hod/teaching' });

  // Advisor pages: require ADVISOR role or explicit permission
  if (entry.advisor_students && (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.view_my_students'))) items.push({ key: 'advisor_students', label: 'My Students', to: '/advisor/students' });
  // Advisor attendance
  if (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.mark_attendance')) items.push({ key: 'advisor_attendance', label: 'Mark Attendance', to: '/advisor/attendance' });

  if (entry.student_curriculum_view && permsLower.some(p => p.includes('curriculum'))) items.push({ key: 'student_curriculum_view', label: 'My Curriculum', to: '/curriculum/student' });

  // Timetable-related entries: require explicit timetable permissions or flags/roles
  if ((flags.can_manage_timetable_templates || permsLower.includes('timetable.manage_templates')) && entry.timetable_templates) items.push({ key: 'timetable_templates', label: 'IQAC: Timetable Templates', to: '/iqac/timetable' });
  const canAssignTimetable = Boolean(flags.can_assign_timetable) || permsLower.includes('timetable.assign') || rolesUpper.includes('ADVISOR') || rolesUpper.includes('HOD')
  if (canAssignTimetable && entry.timetable_assignments) items.push({ key: 'timetable_assignments', label: 'Timetable Assignments', to: '/advisor/timetable' });

  // show student/staff personal timetable based on explicit 'timetable.view' permission and profile flags
  if (flags.can_view_timetable && flags.is_student && permsLower.includes('timetable.view')) items.push({ key: 'student_timetable', label: 'My Timetable', to: '/student/timetable' });
  if (flags.can_view_timetable && flags.is_staff && permsLower.includes('timetable.view')) items.push({ key: 'staff_timetable', label: 'My Timetable (Staff)', to: '/staff/timetable' });

  // Staff assigned subjects page
  if (flags.is_staff && (permsLower.includes('academics.view_assigned_subjects') || rolesUpper.includes('HOD'))) {
    items.push({ key: 'assigned_subjects', label: 'Assigned Subjects', to: '/staff/assigned-subjects' });
  }

  // Student attendance
  if (flags.is_student && (permsLower.includes('academics.view_attendance') || permsLower.includes('attendance.view') )) items.push({ key: 'student_attendance', label: 'My Attendance', to: '/student/attendance' });

  // fallback: always show profile
  items.unshift({ key: 'profile', label: 'Profile', to: '/profile' });

  return (
    <aside className={`dsb modern-dsb ${collapsed ? 'collapsed' : ''}`}>
      <div className="dsb-header">Menu</div>
      <ul className="dsb-list">
        <li className="dsb-item">
          <Link to="/dashboard" className="dsb-link">
            <span className="dsb-icon"><Home /></span>
            <span className="dsb-label">Dashboard</span>
          </Link>
        </li>
        {items.map(i => {
          const Icon = ICON_MAP[i.key] || ICON_MAP.home || User;
          const active = loc.pathname.startsWith(i.to);
          return (
            <li key={i.key} className={`dsb-item ${active ? 'active' : ''}`}>
              <Link to={i.to} className="dsb-link">
                <span className="dsb-icon"><Icon /></span>
                <span className="dsb-label">{i.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
