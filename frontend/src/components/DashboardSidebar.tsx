import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';



import useDashboard from '../hooks/useDashboard';
import { User, BookOpen, Layout, Grid, Home, Bell, CalendarClock } from 'lucide-react';
import './DashboardSidebar.css';
import { useSidebar } from './SidebarContext';
import { fetchPendingPublishRequestCount } from '../services/obe';

const ICON_MAP: Record<string, any> = {
  profile: User,
  curriculum_master: BookOpen,
    assigned_subjects: BookOpen,
  department_curriculum: Layout,
  student_curriculum_view: Grid,
  home: Home,
  obe: BookOpen,
  obe_master: BookOpen,
  obe_due_dates: CalendarClock,
  obe_requests: Bell,
};

export default function DashboardSidebar({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error } = useDashboard(baseUrl);
  const loc = useLocation();
  const { collapsed } = useSidebar();
  const [pendingObeReqCount, setPendingObeReqCount] = useState<number>(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const perms = (data?.permissions || []).map((p) => String(p || '').toLowerCase());
  const canObeMaster = perms.includes('obe.master.manage');

  useEffect(() => {
    let mounted = true;
    const token = window.localStorage.getItem('access');
    if (!canObeMaster || !token) {
      setPendingObeReqCount(0);
      return () => {
        mounted = false;
      };
    }
    (async () => {
      try {
        const resp = await fetchPendingPublishRequestCount();
        if (!mounted) return;
        setPendingObeReqCount(Number(resp.pending || 0));
      } catch {
        // badge is best-effort
      }
    })();
    const interval = window.setInterval(() => {
      (async () => {
        try {
          const resp = await fetchPendingPublishRequestCount();
          if (!mounted) return;
          setPendingObeReqCount(Number(resp.pending || 0));
        } catch {
          // ignore
        }
      })();
    }, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [canObeMaster]);

  // auto-expand Academic when on /academic routes
  useEffect(() => {
    if (loc.pathname.startsWith('/academic')) {
      setExpanded((p) => ({ ...p, academic: true }));
    }
  }, [loc.pathname]);

  if (loading) return <aside className="dsb">Loading</aside>;
  if (error) return <aside className="dsb">Error loading sidebar</aside>;
  if (!data) return <aside className="dsb">Nodata</aside>;

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
  if (entry.hod_teaching && (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.assign_teaching'))) items.push({ key: 'hod_teaching', label: 'Teaching Assignments', to: '/advisor/teaching' });

  // Advisor pages: require ADVISOR role or explicit permission
  if (entry.advisor_students && (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.view_my_students'))) items.push({ key: 'advisor_students', label: 'My Students', to: '/advisor/students' });

  if (entry.student_curriculum_view && permsLower.some(p => p.includes('curriculum'))) items.push({ key: 'student_curriculum_view', label: 'My Curriculum', to: '/curriculum/student' });

  // Timetable-related entries: require explicit timetable permissions or flags/roles
  if ((flags.can_manage_timetable_templates || permsLower.includes('timetable.manage_templates')) && entry.timetable_templates) items.push({ key: 'timetable_templates', label: 'IQAC: Timetable Templates', to: '/iqac/timetable' });
  // Only advisors or users with explicit permission/flag may assign timetables.
  // HODs previously appeared here because they were included in the role check;
  // remove HOD so the link doesn't show by default for HOD users unless they
  // also have the 'timetable.assign' permission or a feature flag.
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

  // Period attendance for staff
  if (flags.is_staff && (permsLower.includes('academics.mark_attendance') || rolesUpper.includes('HOD') || rolesUpper.includes('ADVISOR'))) {
    items.push({ key: 'period_attendance', label: 'Mark Attendance', to: '/staff/period-attendance' });
  }

  // Attendance menu items removed

  // fallback: always show profile
  items.unshift({ key: 'profile', label: 'Profile', to: '/profile' });

  // Only add OBE once
  // Group OBE-related links under a single Academic page
  // Show Academic for all staff
  if (flags.is_staff && !items.some(item => item.key === 'academic')) {
    items.push({ key: 'academic', label: 'Academic', to: '/academic' });
  }
  if (canObeMaster && !items.some(item => item.key === 'obe_due_dates')) {
    items.push({ key: 'obe_due_dates', label: 'OBE: Due Dates', to: '/obe/master/due-dates' });
  }
  if (canObeMaster && !items.some(item => item.key === 'obe_requests')) {
    items.push({ key: 'obe_requests', label: 'OBE: Requests', to: '/obe/master/requests' });
  }

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
                <Link to={i.to} className="dsb-link" onClick={(e) => {
                  if (i.key === 'academic') {
                    // toggle submenu open/close but allow navigation
                    setExpanded((p) => ({ ...p, academic: !p.academic }));
                  }
                }}>
                  <span className="dsb-icon"><Icon /></span>
                  <span className="dsb-label">
                    {i.label}
                    {i.key === 'obe_requests' && pendingObeReqCount > 0 ? (
                      <span className="dsb-badge" aria-label={`${pendingObeReqCount} pending OBE requests`}>{pendingObeReqCount}</span>
                    ) : null}
                  </span>
                </Link>

                {/* Submenu for Academic: show OBE Master and Due Dates as slide items */}
                {i.key === 'academic' && canObeMaster && expanded.academic ? (
                  <ul className="dsb-sublist">
                    <li className={`dsb-item ${loc.pathname.startsWith('/academic') && new URLSearchParams(loc.search).get('tab') === 'obe_master' ? 'active' : ''}`}>
                      <Link to={'/academic?tab=obe_master'} className="dsb-link dsb-sub-link">
                        <span className="dsb-icon"><BookOpen /></span>
                        <span className="dsb-label">OBE Master</span>
                      </Link>
                    </li>
                    <li className={`dsb-item ${loc.pathname.startsWith('/academic') && new URLSearchParams(loc.search).get('tab') === 'due_dates' ? 'active' : ''}`}>
                      <Link to={'/academic?tab=due_dates'} className="dsb-link dsb-sub-link">
                        <span className="dsb-icon"><CalendarClock /></span>
                        <span className="dsb-label">OBE: Due Dates</span>
                      </Link>
                    </li>
                  </ul>
                ) : null}
              </li>
          );
        })}
      </ul>
    </aside>
  );
}
