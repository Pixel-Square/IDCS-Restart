import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';



import useDashboard from '../../hooks/useDashboard';
import { User, BookOpen, Layout, Grid, Home, GraduationCap, Users, Calendar, ClipboardList, Upload, Bell, CalendarClock, MessageSquare, Settings, BarChart2, PartyPopper, ScanLine, Shield } from 'lucide-react';

import { useSidebar } from './SidebarContext';
import { fetchPendingPublishRequestCount } from '../../services/obe';
import { ApplicationsNavResponse, fetchApplicationsNav } from '../../services/applications';

  const ICON_MAP: Record<string, any> = {
  profile: User,
  queries: MessageSquare,
  curriculum_master: BookOpen,
  assigned_subjects: BookOpen,
  department_curriculum: Layout,
  elective_import: Upload,
  student_curriculum_view: Grid,
  home: Home,
  hod_advisors: Users,
  hod_teaching: BookOpen,
  staffs: Users,
  staff_students: GraduationCap,
  mentor_assign: Users,
  timetable_templates: Calendar,
  timetable_assignments: Calendar,
  student_timetable: Calendar,
  staff_timetable: Calendar,
  student_attendance: ClipboardList,
  student_academics: GraduationCap,
  period_attendance: ClipboardList,
  obe: BookOpen,
  obe_master: BookOpen,
  obe_due_dates: CalendarClock,
  obe_requests: Bell,
  hod_obe_requests: Bell,
  hod_result_analysis: BarChart2,
  hod_events: PartyPopper,
  iqac_event_approvals: PartyPopper,
  academic_controller: Layout,
  notifications: Bell,
  academic_calendar: Calendar,
  pbas: ClipboardList,
  pbas_manager: Layout,
  settings: Settings,
<<<<<<< HEAD
  applications_admin: Layout,
  applications_inbox: ClipboardList,
  applications_home: Layout,
  idscan_test: ScanLine,
  idscan_gatepass: Shield,
=======
  rf_reader: Grid,
>>>>>>> 44b6445 (JUDSON CANVA)

};

export default function DashboardSidebar({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error } = useDashboard(baseUrl);
  const loc = useLocation();

  const { collapsed, toggle } = useSidebar();
  const [pendingObeReqCount, setPendingObeReqCount] = useState<number>(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [applicationsNav, setApplicationsNav] = useState<ApplicationsNavResponse | null>(null);

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

  // auto-expand Academic Controller when on /iqac/academic-controller routes
  useEffect(() => {
    if (loc.pathname.startsWith('/iqac/academic-controller')) {
      setExpanded((p) => ({ ...p, academic_controller: true }));
    }
  }, [loc.pathname]);

<<<<<<< HEAD
  useEffect(() => {
    let mounted = true;
    if (!data) return;

    (async () => {
      try {
        const nav = await fetchApplicationsNav();
        if (!mounted) return;
        setApplicationsNav(nav);
      } catch {
        if (!mounted) return;
        setApplicationsNav({ show_applications: false, staff_roles: [], staff_department: null, override_roles: [] });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [data]);
=======
  // auto-expand RFReader when on /iqac/rf-reader routes
  useEffect(() => {
    if (loc.pathname.startsWith('/iqac/rf-reader')) {
      setExpanded((p) => ({ ...p, rf_reader: true }));
    }
  }, [loc.pathname]);
>>>>>>> 44b6445 (JUDSON CANVA)

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
  const isIqac = rolesUpper.includes('IQAC');
  const isIqacMain = Boolean((data as any)?.is_iqac_main === true || (isIqac && String((data as any)?.username || '').trim() === '000000'));
  const canPbasManage = rolesUpper.some((r) => ['IQAC', 'ADMIN', 'PRINCIPAL', 'PS'].includes(r));

  

  // Curriculum master/department: require explicit curriculum permissions if present, otherwise rely on entry point
  if (entry.curriculum_master && (permsLower.some(p => p.includes('curriculum')) || entry.curriculum_master)) items.push({ key: 'curriculum_master', label: 'Curriculum Master', to: '/curriculum/master' });
  if (entry.department_curriculum && (permsLower.some(p => p.includes('curriculum')) || entry.department_curriculum)) items.push({ key: 'department_curriculum', label: 'Department Curriculum', to: '/curriculum/department' });
  if (permsLower.includes('curriculum.import_elective_choices')) items.push({ key: 'elective_import', label: 'Elective Import', to: '/curriculum/elective-import' });

  // HOD pages: require HOD role or explicit permission
  if (entry.hod_advisors && (rolesUpper.includes('HOD') || permsLower.includes('academics.assign_advisor'))) items.push({ key: 'hod_advisors', label: 'Advisor Assign', to: '/hod/advisors' });
  if (entry.hod_teaching && (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.assign_teaching'))) items.push({ key: 'hod_teaching', label: 'Teaching Assign', to: '/advisor/teaching' });
  const canHodObeRequests = Boolean((entry as any)?.hod_obe_requests) || rolesUpper.includes('HOD');
  if (canHodObeRequests) items.push({ key: 'hod_obe_requests', label: 'HOD: OBE Requests', to: '/hod/obe-requests' });
  if (rolesUpper.includes('HOD') || rolesUpper.includes('ADVISOR')) items.push({ key: 'hod_result_analysis', label: 'Result Analysis', to: '/hod/result-analysis' });
  if (rolesUpper.includes('HOD')) items.push({ key: 'hod_events', label: 'Event Management', to: '/hod/events' });

  if ((isIqac || isIqacMain) && !items.some((item) => item.key === 'iqac_event_approvals')) {
    items.push({ key: 'iqac_event_approvals', label: 'Event Approvals', to: '/iqac/event-approvals' });
  }

  // Staffs page: require explicit view permission
  if (permsLower.includes('academics.view_staffs_page')) {
    items.push({ key: 'staffs', label: 'Staff Directory', to: '/staffs' });
  }

  // Students page: require explicit view permission  
  if (permsLower.includes('students.view_students')) {
    items.push({ key: 'staff_students', label: 'Students', to: '/staff/students' });
  }

  // Advisor pages: require ADVISOR role or explicit permission
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
    items.push({ key: 'student_academics', label: 'My Marks', to: '/student/academics' });
    items.push({ key: 'student_attendance', label: 'My Attendance', to: '/student/attendance' });
    items.push({ key: 'pbas', label: 'My Progress', to: '/student/pbas' });
  }

  // Staff assigned subjects page
  if (flags.is_staff && (permsLower.includes('academics.view_assigned_subjects') || rolesUpper.includes('HOD'))) {
    items.push({ key: 'assigned_subjects', label: 'Assigned Subjects', to: '/staff/assigned-subjects' });
  }


  // PBAS submission for staff
  if (flags.is_staff) {
    items.push({ key: 'pbas', label: 'PBAS', to: '/staff/pbas' });
  }

  // Period attendance for staff
  if (flags.is_staff && (permsLower.includes('academics.mark_attendance') || rolesUpper.includes('HOD') || rolesUpper.includes('ADVISOR'))) {
    items.push({ key: 'period_attendance', label: 'Mark Attendance', to: '/staff/period-attendance' });
  }

  // Attendance analytics for staff (use academics.* permission codenames)
  if (flags.is_staff && (
    permsLower.includes('academics.view_all_attendance') ||
    permsLower.includes('academics.view_attendance_overall') ||
    permsLower.includes('academics.view_all_departments') ||
    permsLower.includes('academics.view_department_attendance') ||
    permsLower.includes('academics.view_class_attendance') ||
    permsLower.includes('academics.view_section_attendance')
  )) {
    items.push({ key: 'attendance_analytics', label: 'Attendance Analytics', to: '/staff/analytics' });
  }

  // fallback: always show profile
  items.unshift({ key: 'profile', label: 'Profile', to: '/profile' });

  // Academic calendar is available for all authenticated users
  items.push({ key: 'academic_calendar', label: 'Academic Calendar', to: '/academic-calendar' });

  // Settings (IQAC only) – includes Notification Templates and WhatsApp config
  if (isIqac && !items.some((item) => item.key === 'settings')) {
    items.push({ key: 'settings', label: 'Settings', to: '/settings' });
  }

  // RFReader (IQAC only)
  if (isIqac && !items.some((item) => item.key === 'rf_reader')) {
    items.push({ key: 'rf_reader', label: 'RFReader', to: '/iqac/rf-reader' });
  }

  // Only add OBE once
  // Group OBE-related links under a single Academic page
  // Show Academic for all staff
  if (flags.is_staff && !items.some(item => item.key === 'academic')) {
    items.push({ key: 'academic', label: 'Academic', to: '/academic' });
  }
  if (isIqac && !items.some((item) => item.key === 'academic_controller')) {
    items.push({ key: 'academic_controller', label: 'Academic Controller', to: '/iqac/academic-controller' });
  }
  if (isIqac && !items.some((item) => item.key === 'applications_admin')) {
    items.push({ key: 'applications_admin', label: 'Applications Admin', to: '/iqac/applications-admin' });
  }
  // IDCSScan — available to SECURITY, IQAC, and ADMIN roles
  const isSecurity = rolesUpper.includes('SECURITY');
  if (isSecurity && !items.some((i) => i.key === 'idscan_test')) {
    items.push({ key: 'idscan_test',     label: 'RFID Scanner Test', to: '/idscan/test' });
    items.push({ key: 'idscan_gatepass', label: 'Gatepass Scanner',   to: '/idscan/gatepass' });
  }
  if (!isSecurity && applicationsNav?.show_applications && !items.some((item) => item.key === 'applications_home')) {
    items.push({ key: 'applications_home', label: 'My Applications', to: '/applications' });
  }
  if (!isSecurity && applicationsNav?.show_applications && (applicationsNav.staff_roles.length > 0 || applicationsNav.override_roles.length > 0) && !flags.is_student && !items.some((item) => item.key === 'applications_inbox')) {
    items.push({ key: 'applications_inbox', label: 'Approvals Inbox', to: '/applications/inbox' });
  }
  if (canPbasManage && !items.some((item) => item.key === 'pbas_manager')) {
    items.push({ key: 'pbas_manager', label: 'PBAS Manager', to: '/iqac/pbas' });
  }
  if (canObeMaster && !isIqac && !items.some(item => item.key === 'obe_due_dates')) {
    items.push({ key: 'obe_due_dates', label: 'OBE: Due Dates', to: '/obe/master/due-dates' });
  }
  if (canObeMaster && !items.some(item => item.key === 'obe_requests')) {
    items.push({ key: 'obe_requests', label: 'OBE: Requests', to: '/obe/master/requests' });
  }

  // Add Token Raise for all users at the end (no permission check needed)
  items.push({ key: 'queries', label: 'Raise Token ', to: '/queries' });

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
      <aside className={`fixed top-16 left-0 h-[calc(100vh-4rem)] bg-white shadow-lg transition-all duration-300 z-30 overflow-y-auto ${collapsed ? '-translate-x-full lg:translate-x-0 lg:w-20' : 'w-full lg:w-64'}`}>
        {/* Header - Hidden */}
        <div className="hidden" />

        {/* Navigation Links */}
        <nav className="py-6">
          <ul className="space-y-2 px-3">
            {/* Dashboard Link */}
            <li>
              <Link
                to="/dashboard"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${loc.pathname === '/dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
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
                <li key={i.key} className="relative">
                  <Link
                    to={i.to}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${active ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
                    onClick={() => {
                      // preserve mobile toggle behaviour
                      if (window.innerWidth < 1024) toggle();
                      // toggle submenu expansion for specific groups
                      if (i.key === 'academic') setExpanded((p) => ({ ...p, academic: !p.academic }));
                      if (i.key === 'academic_controller') setExpanded((p) => ({ ...p, academic_controller: !p.academic_controller }));
                      if (i.key === 'rf_reader') setExpanded((p) => ({ ...p, rf_reader: !p.rf_reader }));
                    }}
                  >
                    <Icon className={`flex-shrink-0 ${collapsed ? 'lg:w-5 lg:h-5' : 'w-6 h-6'}`} />
                    <span className={`font-medium text-base ${collapsed ? 'lg:hidden' : ''}`}>
                      {i.label}
                      {i.key === 'obe_requests' && pendingObeReqCount > 0 ? (
                        <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-600 text-white">{pendingObeReqCount}</span>
                      ) : null}
                    </span>
                  </Link>

                    {/* Submenu for Academic: show OBE Master and Due Dates.
                      Hidden when sidebar is collapsed and for IQAC role
                      (IQAC main account uses other IQAC tools instead). */}
                    {i.key === 'academic' && canObeMaster && expanded.academic && !collapsed && !isIqac ? (
                    <ul className="pl-8 mt-1 space-y-1">
                      <li>
                        <Link to={'/academic?tab=obe_master'} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/academic') && new URLSearchParams(loc.search).get('tab') === 'obe_master' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                          <BookOpen className="w-4 h-4" /> <span>OBE Master</span>
                        </Link>
                      </li>
                      {!isIqac ? (
                        <li>
                          <Link to={'/academic?tab=due_dates'} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/academic') && new URLSearchParams(loc.search).get('tab') === 'due_dates' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                            <CalendarClock className="w-4 h-4" /> <span>OBE: Due Dates</span>
                          </Link>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}

                  {/* Submenu for Academic Controller (IQAC).
                      Also hidden when sidebar is collapsed. */}
                  {i.key === 'academic_controller' && expanded.academic_controller && !collapsed ? (
                    <ul className="pl-8 mt-1 space-y-1">
                      <li>
                        <Link to={'/iqac/academic-controller?tab=dashboard'} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/iqac/academic-controller') && new URLSearchParams(loc.search).get('tab') === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                          <Home className="w-4 h-4" /> <span>Dashboard</span>
                        </Link>
                      </li>
                      <li>
                        <Link to={'/iqac/academic-controller?tab=qp'} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/iqac/academic-controller') && new URLSearchParams(loc.search).get('tab') === 'qp' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                          <Grid className="w-4 h-4" /> <span>QP</span>
                        </Link>
                      </li>
                      <li>
                        <Link to={'/iqac/academic-controller?tab=due_dates'} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/iqac/academic-controller') && new URLSearchParams(loc.search).get('tab') === 'due_dates' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                          <CalendarClock className="w-4 h-4" /> <span>OBE Due Dates</span>
                        </Link>
                      </li>
                      <li>
                        <Link to={'/iqac/academic-controller?tab=courses'} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/iqac/academic-controller') && new URLSearchParams(loc.search).get('tab') === 'courses' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                          <Grid className="w-4 h-4" /> <span>Courses</span>
                        </Link>
                      </li>
                    </ul>
                  ) : null}

                  {/* Submenu for RFReader (IQAC).
                      Hidden when sidebar is collapsed. */}
                  {i.key === 'rf_reader' && expanded.rf_reader && !collapsed ? (
                    <ul className="pl-8 mt-1 space-y-1">
                      <li>
                        <Link
                          to={'/iqac/rf-reader/create-gate'}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/iqac/rf-reader') && loc.pathname.includes('/create-gate') ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                          onClick={() => { if (window.innerWidth < 1024) toggle(); }}
                        >
                          <Grid className="w-4 h-4" /> <span>Create Gate</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          to={'/iqac/rf-reader/test-students'}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/iqac/rf-reader') && loc.pathname.includes('/test-students') ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                          onClick={() => { if (window.innerWidth < 1024) toggle(); }}
                        >
                          <Grid className="w-4 h-4" /> <span>Test Students</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          to={'/iqac/rf-reader/add-students-rf'}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/iqac/rf-reader') && loc.pathname.includes('/add-students-rf') ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                          onClick={() => { if (window.innerWidth < 1024) toggle(); }}
                        >
                          <Grid className="w-4 h-4" /> <span>Add Students RF</span>
                        </Link>
                      </li>
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
