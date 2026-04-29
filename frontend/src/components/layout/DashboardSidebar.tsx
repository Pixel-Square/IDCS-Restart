import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import useDashboard from '../../hooks/useDashboard';
import { User, BookOpen, Layout, Grid, Home, GraduationCap, Users, Calendar, ClipboardList, Upload, Bell, CalendarClock, MessageSquare, Settings, BarChart2, PartyPopper, FileText, ScanLine, Shield, MessageCircle, ChevronDown, ChevronRight, UserCheck, Wallet, Fingerprint } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { ApplicationsNavResponse, fetchApplicationsNav } from '../../services/applications';
import { useAttendanceNotificationCount } from '../../hooks/useAttendanceNotificationCount';
import { fetchCurriculumPendingCount } from '../../services/curriculum';

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
  faculty_directory: Users,
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
  hr_request_templates: FileText,
  hr_manage_gate: Shield,
  hr_staff_validation: UserCheck,
  hr_staff_salary: Wallet,
  staff_salary: Wallet,
  staff_requests_approvals: Bell,
  event_attending: FileText,
  requests_hub: Bell,
  applications_admin: Layout,
  applications_inbox: ClipboardList,
  applications_home: Layout,
  external_management: Users,
  lms: BookOpen,
  idscan_test: ScanLine,
  idscan_gatepass: Shield,
  idscan_gatescan: Shield,
  idscan_fingerprint: Fingerprint,
  rf_reader: Grid,
  feedback: MessageCircle,
  announcements: Bell,
  create_event: PartyPopper,
  my_proposals: FileText,
  hod_event_approvals: ClipboardList,
  hod_event_management: PartyPopper,
  haa_event_approvals: ClipboardList,
  haa_event_management: PartyPopper,
  coe_portal: Shield,
  coe_students_list: GraduationCap,
  coe_course_list: BookOpen,
  coe_arrear_list: ClipboardList,
  coe_bundle_allocation: ClipboardList,
  coe_bar_scan: ScanLine,
  coe_bar_scan_entry: ScanLine,
  coe_retrival: FileText,
  coe_one_page_report: FileText,
};

export default function DashboardSidebar({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error } = useDashboard(baseUrl);
  const loc = useLocation();

  const { collapsed, toggle } = useSidebar();
  const [pendingSwapReqCount, setPendingSwapReqCount] = useState<number>(0);
  const [pendingAttendanceReqCount, setPendingAttendanceReqCount] = useState<number>(0);
  const [pendingCurriculumCount, setPendingCurriculumCount] = useState<number>(0);
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState<number>(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [applicationsNav, setApplicationsNav] = useState<ApplicationsNavResponse | null>(null);

  const permsForHook = (data?.permissions || []).map((p) => String(p || '').toLowerCase());
  const rolesForHook = (data?.roles || []).map((r) => String(r || '').toUpperCase());
  const isIqacForBadge = rolesForHook.includes('IQAC');
  const isHodOrIqac = rolesForHook.includes('HOD') || rolesForHook.includes('IQAC');
  const { count: attendanceNotifCount } = useAttendanceNotificationCount(isHodOrIqac);

  const perms = (data?.permissions || []).map((p) => String(p || '').toLowerCase());
  const canObeMasterManage = perms.includes('obe.master.manage');

  const canViewAnnouncements = perms.includes('announcements.view_announcement_page');
  const isStaff = data?.flags?.is_staff || false;
  const canFetchPendingSwap = rolesForHook.some((r) => ['HOD', 'AHOD', 'ADVISOR'].includes(r));
  const canFetchPendingAttendanceAssign = rolesForHook.some((r) => ['HOD', 'AHOD', 'ADVISOR', 'IQAC'].includes(r));

  // Fetch pending swap request count and attendance assignment request count for staff
  useEffect(() => {
    let mounted = true;

    const fetchCounts = async () => {
      if (!isStaff) {
        setPendingSwapReqCount(0);
        setPendingAttendanceReqCount(0);
        return;
      }

      if (!canFetchPendingSwap && !canFetchPendingAttendanceAssign) {
        setPendingSwapReqCount(0);
        setPendingAttendanceReqCount(0);
        return;
      }

      try {
        const requests: Promise<Response>[] = [];
        if (canFetchPendingSwap) {
          requests.push(fetchWithAuth('/api/timetable/swap-requests/?status=PENDING'));
        }
        if (canFetchPendingAttendanceAssign) {
          requests.push(fetchWithAuth('/api/academics/attendance-assignment-requests/?status=PENDING'));
        }

        const responses = await Promise.all(requests);
        if (!mounted) return;

        let index = 0;
        if (canFetchPendingSwap) {
          const swapRes = responses[index++];
          if (swapRes?.ok) {
            const d = await swapRes.json();
            setPendingSwapReqCount((d.received || []).length);
          } else {
            setPendingSwapReqCount(0);
          }
        } else {
          setPendingSwapReqCount(0);
        }

        if (canFetchPendingAttendanceAssign) {
          const attendanceRes = responses[index++];
          if (attendanceRes?.ok) {
            const d = await attendanceRes.json();
            setPendingAttendanceReqCount((d.received || []).length);
          } else {
            setPendingAttendanceReqCount(0);
          }
        } else {
          setPendingAttendanceReqCount(0);
        }
      } catch {
        // badge is best-effort
      }
    };

    fetchCounts();
    const interval = window.setInterval(fetchCounts, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [isStaff, canFetchPendingSwap, canFetchPendingAttendanceAssign]);

  // auto-expand Academic when on /academic routes
  useEffect(() => {
    if (loc.pathname.startsWith('/academic')) {
      setExpanded((p) => ({ ...p, academic: true }));
    }
  }, [loc.pathname]);

  // auto-expand HOD Event Management group when on any event route
  useEffect(() => {
    if (
      loc.pathname.startsWith('/events/create-event') ||
      loc.pathname.startsWith('/events/my-proposals') ||
      loc.pathname.startsWith('/hod/event-approvals')
    ) {
      setExpanded((p) => ({ ...p, hod_event_management: true }));
    }
  }, [loc.pathname]);

  // auto-expand HAA Event Management group when on any HAA event route
  useEffect(() => {
    if (
      loc.pathname.startsWith('/events/create-event') ||
      loc.pathname.startsWith('/events/my-proposals') ||
      loc.pathname.startsWith('/haa/event-approvals')
    ) {
      setExpanded((p) => ({ ...p, haa_event_management: true }));
    }
  }, [loc.pathname]);

  // auto-expand Faculty Directory group when on faculty pages
  useEffect(() => {
    if (
      loc.pathname.startsWith('/staffs') ||
      loc.pathname.startsWith('/hod/advisors') ||
      loc.pathname.startsWith('/advisor/teaching') ||
      loc.pathname.startsWith('/hod/staff-attendance') ||
      loc.pathname.startsWith('/faculty/attendance')
    ) {
      setExpanded((p) => ({ ...p, faculty_directory: true }));
    }
  }, [loc.pathname]);

  // auto-expand Academic Controller when on /iqac/academic-controller routes
  useEffect(() => {
    if (loc.pathname.startsWith('/iqac/academic-controller')) {
      setExpanded((p) => ({ ...p, academic_controller: true }));
    }
  }, [loc.pathname]);

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

  useEffect(() => {
    let mounted = true;

    const fetchPendingCount = async () => {
      if (!isIqacForBadge) {
        setPendingCurriculumCount(0);
        return;
      }
      try {
        const resp = await fetchCurriculumPendingCount();
        if (!mounted) return;
        setPendingCurriculumCount(Number(resp.totalPending || 0));
      } catch {
        // badge is best-effort
      }
    };

    fetchPendingCount();
    const interval = window.setInterval(fetchPendingCount, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [isIqacForBadge]);

  useEffect(() => {
    let mounted = true;

    const fetchUnreadAnnouncements = async () => {
      if (!canViewAnnouncements) {
        setUnreadAnnouncementsCount(0);
        return;
      }
      try {
        const response = await fetchWithAuth('/api/announcements/announcements/unread-count/');
        if (!mounted) return;
        if (!response.ok) {
          setUnreadAnnouncementsCount(0);
          return;
        }
        const payload = await response.json();
        setUnreadAnnouncementsCount(Number(payload?.unread_count || 0));
      } catch {
        if (!mounted) return;
        setUnreadAnnouncementsCount(0);
      }
    };

    fetchUnreadAnnouncements();
    const interval = window.setInterval(fetchUnreadAnnouncements, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [canViewAnnouncements]);
  // auto-expand RFReader when on /iqac/rf-reader routes
  useEffect(() => {
    if (loc.pathname.startsWith('/iqac/rf-reader')) {
      setExpanded((p) => ({ ...p, rf_reader: true }));
    }
  }, [loc.pathname]);

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

  const items: Array<{ key: string; label: string; to: string; icon?: any }> = [];
  const permsLower = (data.permissions || []).map(p => (p || '').toString().toLowerCase());
  const rolesUpper = (data.roles || []).map(r => (r || '').toString().toUpperCase());
  const emailLower = String((data as any).email || '').toLowerCase().trim();
  const flags = data.flags || {};
  const isIqac = rolesUpper.includes('IQAC');
  const isIqacMain = Boolean((data as any)?.is_iqac_main === true || (isIqac && String((data as any)?.username || '').trim() === '000000'));
  const canPbasManage = rolesUpper.some((r) => ['IQAC', 'ADMIN', 'PRINCIPAL', 'PS'].includes(r));

  

  // Curriculum master/department: require explicit curriculum permissions if present, otherwise rely on entry point
  if (entry.curriculum_master && (permsLower.some(p => p.includes('curriculum')) || entry.curriculum_master)) items.push({ key: 'curriculum_master', label: 'Curriculum Master', to: '/curriculum/master' });
  if (entry.department_curriculum && (permsLower.some(p => p.includes('curriculum')) || entry.department_curriculum)) items.push({ key: 'department_curriculum', label: 'Department Curriculum', to: '/curriculum/department' });
  if (permsLower.includes('curriculum.import_elective_choices')) items.push({ key: 'elective_import', label: 'Elective Import', to: '/curriculum/elective-import' });

  // HOD pages: require HOD role or explicit permission
  const canAccessTeachingAssign = entry.hod_teaching && (rolesUpper.includes('ADVISOR') || permsLower.includes('academics.assign_teaching'));
  const canAccessAdvisorAssign = entry.hod_advisors && (rolesUpper.includes('HOD') || permsLower.includes('academics.assign_advisor'));
  const canAccessFacultyDirectory = permsLower.includes('academics.view_staffs_page') || rolesUpper.includes('PS');
  const canAccessFacultyAttendance = rolesUpper.includes('HOD');
  const canAccessIqacFacultyAttendance = rolesUpper.includes('IQAC');
  if (canAccessAdvisorAssign || canAccessTeachingAssign || canAccessFacultyAttendance || canAccessIqacFacultyAttendance || canAccessFacultyDirectory) {
    items.push({ key: 'faculty_directory', label: 'Faculty Directory', to: '#' });
  }
  if (rolesUpper.includes('HOD') || rolesUpper.includes('ADVISOR')) items.push({ key: 'hod_result_analysis', label: 'Result Analysis', to: '/hod/result-analysis' });

  // ── Event Proposal Workflow ───────────────────────────────────────────
  const isHod = rolesUpper.includes('HOD');
  const isHaa = rolesUpper.includes('HAA');
  const hasCreateProposal = permsLower.includes('events.create_proposal');
  const hasHodApprove = permsLower.includes('events.hod_approve');
  const hasHaaApprove = permsLower.includes('events.haa_approve');

  if (isHod && (hasCreateProposal || hasHodApprove)) {
    // HOD: group all three under a collapsible "Event Management"
    items.push({ key: 'hod_event_management', label: 'Event Management', to: '#' });
  } else if (isHaa && (hasCreateProposal || hasHaaApprove)) {
    // HAA: group Create Event + My Proposals + HAA Event Approvals under "Event Management"
    items.push({ key: 'haa_event_management', label: 'Event Management', to: '#' });
  } else {
    // Regular staff: show individually
    if (hasCreateProposal && !items.some(i => i.key === 'create_event')) {
      items.push({ key: 'create_event', label: 'Create Event', to: '/events/create-event' });
      items.push({ key: 'my_proposals', label: 'My Proposals', to: '/events/my-proposals' });
    }
    // Non-HAA users with haa_approve (edge case)
    if (hasHaaApprove && !items.some(i => i.key === 'haa_event_approvals')) {
      items.push({ key: 'haa_event_approvals', label: 'HAA: Event Approvals', to: '/haa/event-approvals' });
    }
  }

  if ((isIqac || isIqacMain) && !items.some((item) => item.key === 'iqac_event_approvals')) {
    items.push({ key: 'iqac_event_approvals', label: 'Event Approvals', to: '/iqac/event-approvals' });
  }

  // HOD staff attendance moved under Faculty Directory dropdown group.

  // Staffs page moved under Faculty Directory dropdown group.

  // Students page: require explicit view permission  
  if (permsLower.includes('students.view_students')) {
    items.push({ key: 'staff_students', label: 'Students', to: '/staff/students' });
  }

  // Feedback page: require explicit feedback permission
  if (permsLower.includes('feedback.feedback_page')) {
    items.push({ key: 'feedback', label: 'Feedback', to: '/feedback' });
  }

  // Announcements page: permission-driven visibility
  if (permsLower.includes('announcements.view_announcement_page')) {
    items.push({ key: 'announcements', label: 'Announcements', to: '/announcements' });
  }

  if ((permsLower.includes('coe.portal.access') || emailLower === 'coe@krct.ac.in') && !items.some((item) => item.key === 'coe_portal')) {
    items.push({ key: 'coe_portal', label: 'COE Portal', to: '/coe' });
    items.push({ key: 'coe_students_list', label: 'StudentsList', to: '/coe/students' });
    items.push({ key: 'coe_course_list', label: 'Course List', to: '/coe/courses' });
    items.push({ key: 'coe_arrear_list', label: 'Arrear List', to: '/coe/arrears' });
    items.push({ key: 'coe_bundle_allocation', label: 'Bundle Allocation', to: '/coe/bundle-allocation' });
    items.push({ key: 'coe_bar_scan', label: 'Barcode Reader', to: '/coe/bar-scan' });
    items.push({ key: 'coe_bar_scan_entry', label: 'Barcode Entry', to: '/coe/bar-scan/entry' });
    items.push({ key: 'coe_retrival', label: 'Retrival', to: '/coe/retrival' });
    items.push({ key: 'coe_one_page_report', label: 'One Page Report', to: '/coe/one-page-report' });
  }

  // LMS page visibility via lms.page.* permissions
  if (
    permsLower.includes('lms.page.student') ||
    permsLower.includes('lms.page.staff') ||
    permsLower.includes('lms.page.hod') ||
    permsLower.includes('lms.page.ahod') ||
    permsLower.includes('lms.page.iqac') ||
    rolesUpper.includes('STUDENT') ||
    rolesUpper.includes('STAFF') ||
    rolesUpper.includes('FACULTY') ||
    rolesUpper.includes('HOD') ||
    rolesUpper.includes('AHOD') ||
    rolesUpper.includes('IQAC')
  ) {
    items.push({ key: 'lms', label: 'LMS', to: '/lms' });
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
  }

  // Staff assigned subjects page
  if (flags.is_staff && (permsLower.includes('academics.view_assigned_subjects') || rolesUpper.includes('HOD'))) {
    items.push({ key: 'assigned_subjects', label: 'Assigned Subjects', to: '/staff/assigned-subjects' });
  }


  // PBAS submission for staff
  if (flags.is_staff) {
  }

  // My Calendar for staff (combined attendance + requests)
  if (flags.is_staff) {
    items.push({ key: 'my_attendance', label: 'My Calendar', to: '/staff/my-attendance' });
    items.push({ key: 'staff_salary', label: 'Salary', to: '/staff/salary' });
  }

  // Period attendance for staff
  if (flags.is_staff && (permsLower.includes('academics.mark_attendance') || rolesUpper.includes('HOD') || rolesUpper.includes('ADVISOR'))) {
    items.push({ key: 'period_attendance', label: 'Mark Attendance', to: '/staff/period-attendance' });
  }

  // Attendance analytics for staff (use academics.* permission codenames)
  // Also shown for HOD and IQAC roles so they can see the pending-request badge
  const canSeeAttendanceAnalytics =
    flags.is_staff &&
    (
      rolesUpper.includes('HOD') ||
      rolesUpper.includes('IQAC') ||
      permsLower.includes('academics.view_all_attendance') ||
      permsLower.includes('academics.view_attendance_overall') ||
      permsLower.includes('academics.view_all_departments') ||
      permsLower.includes('academics.view_department_attendance') ||
      permsLower.includes('academics.view_class_attendance') ||
      permsLower.includes('academics.view_section_attendance')
    );
  if (canSeeAttendanceAnalytics) {
    items.push({ key: 'attendance_analytics', label: 'Attendance Analytics', to: '/staff/analytics' });
  }

  // fallback: always show profile
  items.unshift({ key: 'profile', label: 'Profile', to: '/profile' });

  // Academic Calendar intentionally hidden from sidebar for all users

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
  // PBAS Manager intentionally hidden from sidebar for all users
  
  if (isIqac && !items.some((item) => item.key === 'applications_admin')) {
    items.push({ key: 'applications_admin', label: 'Applications Admin', to: '/iqac/applications-admin' });
  }
  // IDCSScan — available to SECURITY, IQAC, and ADMIN roles
  const isSecurity = rolesUpper.includes('SECURITY');
  const isLibrary = rolesUpper.includes('LIBRARY');
  
  // LIBRARY role: only Profile and Assign Cards
  if (isLibrary) {
    // Remove all items except Profile that was added via unshift
    const profileItem = items.find(i => i.key === 'profile');
    items.length = 0;
    if (profileItem) items.push(profileItem);
    items.push({ key: 'idscan_assign_cards', label: 'Assign Cards', to: '/idscan/assign-cards' });
    items.push({ key: 'idscan_bulk_entry', label: 'Bulk RFID Entry', to: '/idscan/bulk-entry' });
    items.push({ key: 'idscan_cards_data', label: 'Cards Data', to: '/idscan/cards-data' });
    items.push({ key: 'idscan_fingerprint', label: 'Fingerprint Enroll', to: '/idscan/fingerprint' });
  } else if (isSecurity && !items.some((i) => i.key === 'idscan_test')) {
    items.push({ key: 'idscan_test',     label: 'RFID Scanner Test', to: '/idscan/test' });
    items.push({ key: 'idscan_assign_cards', label: 'RFID Card Assignment', to: '/idscan/assign-cards' });
    items.push({ key: 'idscan_bulk_entry', label: 'Bulk RFID Entry', to: '/idscan/bulk-entry' });
    items.push({ key: 'idscan_cards_data', label: 'Cards Data', to: '/idscan/cards-data' });
    items.push({ key: 'idscan_gatepass', label: 'Gatepass Scanner',   to: '/idscan/gatepass' });
    items.push({ key: 'idscan_gatescan', label: 'GateScan', to: '/idscan/gatescan' });
    items.push({ key: 'idscan_fingerprint', label: 'Fingerprint Enroll', to: '/idscan/fingerprint' });
  }
  if (!isSecurity && applicationsNav?.show_applications && !items.some((item) => item.key === 'applications_home')) {
    items.push({ key: 'applications_home', label: 'My Applications', to: '/applications' });
  }
  const canAccessApplicationsInbox =
    !isSecurity &&
    Boolean(applicationsNav?.show_applications) &&
    ((applicationsNav?.staff_roles?.length || 0) > 0 || (applicationsNav?.override_roles?.length || 0) > 0) &&
    !flags.is_student;
  if (canPbasManage && !items.some((item) => item.key === 'pbas_manager')) {
    items.push({ key: 'pbas_manager', label: 'PBAS Manager', to: '/iqac/pbas' });
  }

  // IQAC External Management
  if (isIqac && !items.some((item) => item.key === 'external_management')) {
    items.push({ key: 'external_management', label: 'External Management', to: '/iqac/external-management' });
  }

  // PS and IQAC specific features
  if (rolesUpper.includes('PS') || rolesUpper.includes('IQAC')) {
    if (!items.some((item) => item.key === 'ps_staff_attendance')) {
      items.push({ key: 'ps_staff_attendance', label: 'Staff Attendance Upload', to: '/ps/staff-attendance/upload' });
    }
  }

  // PS (Principal Secretary) specific features
  if (rolesUpper.includes('PS')) {
    if (!items.some((item) => item.key === 'ps_staff_attendance_view')) {
      items.push({ key: 'ps_staff_attendance_view', label: 'View All Staff Attendance', to: '/ps/staff-attendance/view' });
    }
  }

  if (canObeMasterManage && !isIqac && !items.some(item => item.key === 'obe_due_dates')) {
    items.push({ key: 'obe_due_dates', label: 'OBE: Due Dates', to: '/obe/master/due-dates' });
  }

  // HR Features
  if ((permsLower.includes('staff_requests.manage_templates') || rolesUpper.includes('HR')) && !items.some(item => item.key === 'hr_request_templates')) {
    items.push({ key: 'hr_request_templates', label: 'HR: Request Templates', to: '/hr/request-templates' });
  }

  if ((rolesUpper.includes('HR') || rolesUpper.includes('SECURITY')) && !items.some(item => item.key === 'hr_manage_gate')) {
    items.push({ key: 'hr_manage_gate', label: 'HR: Manage Gate', to: '/hr/manage-gate' });
  }

  if (rolesUpper.includes('HR') && !items.some(item => item.key === 'hr_gatepass_logs')) {
    items.push({ key: 'hr_gatepass_logs', label: 'HR: GatePass Logs', to: '/hr/gatepass-logs' });
  }

  if (rolesUpper.includes('HR') && !items.some(item => item.key === 'hr_staff_attendance_analytics')) {
    items.push({ key: 'hr_staff_attendance_analytics', label: 'HR: Staff Attendance Analytics', to: '/hr/staff-attendance-analytics' });
  }
  if (rolesUpper.includes('HR') && !items.some(item => item.key === 'hr_staff_validation')) {
    items.push({ key: 'hr_staff_validation', label: 'HR: Staff Validation', to: '/hr/staff-validation' });
  }
  if (rolesUpper.includes('HR') && !items.some(item => item.key === 'hr_staff_salary')) {
    items.push({ key: 'hr_staff_salary', label: 'HR: Staff Salary', to: '/hr/staff-salary' });
  }
  
  // Staff Requests system
  // Note: 'My Requests' moved into My Calendar; keep direct link removed to avoid duplication
  // Align with backend: approver roles can access pending approvals even without explicit permission.
  const approverRoles = ['HOD', 'AHOD', 'HR', 'HAA', 'IQAC', 'PS', 'PRINCIPAL', 'ADMIN'];
  const hasApproverRole = rolesUpper.some((r) => approverRoles.includes(r));
  const hasApprovePermission = permsLower.includes('staff_requests.approve_requests');
  const canAccessPendingApprovals = hasApprovePermission || hasApproverRole;
  
  if (canAccessPendingApprovals && !items.some(item => item.key === 'staff_requests_approvals')) {
    items.push({ key: 'staff_requests_approvals', label: 'Pending Approvals', to: '/staff-requests/pending-approvals' });
  }

  // Event Attending: visible to all staff, HR, and other approvers
  if ((flags.is_staff || rolesUpper.some((r) => ['HR', 'IQAC', 'HAA', 'PRINCIPAL', 'PS', 'HOD', 'AHOD', 'ADMIN'].includes(r))) && !items.some(item => item.key === 'event_attending')) {
    items.push({ key: 'event_attending', label: 'Event Attending', to: '/staff-requests/event-attending' });
  }

  // Requests Hub: ONLY for users with staff_requests.approve_requests permission
  if ((canAccessPendingApprovals || canAccessApplicationsInbox) && !items.some(item => item.key === 'requests_hub')) {
    items.push({ key: 'requests_hub', label: 'Requests', to: '/requests' });
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
              const active = i.to !== '#' && loc.pathname.startsWith(i.to);
              const isHodGroup = i.key === 'hod_event_management';
              const isHaaGroup = i.key === 'haa_event_management';
              const isFacultyGroup = i.key === 'faculty_directory';
              const isGroup = isHodGroup || isHaaGroup || isFacultyGroup;
              const groupActive =
                (isHodGroup && (
                  loc.pathname.startsWith('/events/create-event') ||
                  loc.pathname.startsWith('/events/my-proposals') ||
                  loc.pathname.startsWith('/hod/event-approvals')
                )) ||
                (isHaaGroup && (
                  loc.pathname.startsWith('/events/create-event') ||
                  loc.pathname.startsWith('/events/my-proposals') ||
                  loc.pathname.startsWith('/haa/event-approvals')
                )) ||
                (isFacultyGroup && (
                  loc.pathname.startsWith('/staffs') ||
                  loc.pathname.startsWith('/hod/advisors') ||
                  loc.pathname.startsWith('/advisor/teaching') ||
                  loc.pathname.startsWith('/hod/staff-attendance')
                ));
              const groupOpen = isHodGroup
                ? Boolean(expanded.hod_event_management)
                : isHaaGroup
                  ? Boolean(expanded.haa_event_management)
                  : isFacultyGroup
                    ? Boolean(expanded.faculty_directory)
                    : false;
              return (
                <li key={i.key} className="relative">
                  <Link
                    to={i.to}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${active || groupActive ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
                    onClick={(e) => {
                      if (isHodGroup) {
                        e.preventDefault();
                        setExpanded((p) => ({ ...p, hod_event_management: !p.hod_event_management }));
                        return;
                      }
                      if (isHaaGroup) {
                        e.preventDefault();
                        setExpanded((p) => ({ ...p, haa_event_management: !p.haa_event_management }));
                        return;
                      }
                      if (isFacultyGroup) {
                        e.preventDefault();
                        setExpanded((p) => ({ ...p, faculty_directory: !p.faculty_directory }));
                        return;
                      }
                      // preserve mobile toggle behaviour
                      if (window.innerWidth < 1024) toggle();
                      // toggle submenu expansion for specific groups
                      if (i.key === 'academic') setExpanded((p) => ({ ...p, academic: !p.academic }));
                      if (i.key === 'academic_controller') setExpanded((p) => ({ ...p, academic_controller: !p.academic_controller }));
                      if (i.key === 'rf_reader') setExpanded((p) => ({ ...p, rf_reader: !p.rf_reader }));
                    }}
                  >
                    <Icon className={`flex-shrink-0 ${collapsed ? 'lg:w-5 lg:h-5' : 'w-6 h-6'}`} />
                    <span className={`flex-1 font-medium text-base ${collapsed ? 'lg:hidden' : ''}`}>
                      {i.label}
                      {i.key === 'staff_timetable' && pendingSwapReqCount > 0 ? (
                        <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-orange-600 text-white">{pendingSwapReqCount}</span>
                      ) : null}
                      {i.key === 'period_attendance' && pendingAttendanceReqCount > 0 ? (
                        <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-600 text-white">{pendingAttendanceReqCount}</span>
                      ) : null}
                      {i.key === 'attendance_analytics' && attendanceNotifCount > 0 ? (
                        <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-600 text-white">{attendanceNotifCount > 99 ? '99+' : attendanceNotifCount}</span>
                      ) : null}
                      {i.key === 'department_curriculum' && isIqac && pendingCurriculumCount > 0 ? (
                        <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[11px] font-semibold rounded-full bg-red-600 text-white">{pendingCurriculumCount > 99 ? '99+' : pendingCurriculumCount}</span>
                      ) : null}
                      {i.key === 'announcements' && unreadAnnouncementsCount > 0 ? (
                        <span className="ml-2 inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-blue-500" title="Unread announcements" />
                      ) : null}
                    </span>
                    {isGroup && !collapsed && (
                      groupOpen
                        ? <ChevronDown className="w-4 h-4 flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 flex-shrink-0" />
                    )}
                  </Link>

                    {/* Submenu for HAA Event Management group */}
                    {i.key === 'haa_event_management' && groupOpen && !collapsed && (
                      <ul className="pl-8 mt-1 space-y-1">
                        {permsLower.includes('events.create_proposal') && (
                          <li>
                            <Link to="/events/create-event" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/events/create-event') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <PartyPopper className="w-4 h-4" /> <span>Create Event</span>
                            </Link>
                          </li>
                        )}
                        {permsLower.includes('events.create_proposal') && (
                          <li>
                            <Link to="/events/my-proposals" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/events/my-proposals') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <FileText className="w-4 h-4" /> <span>My Proposals</span>
                            </Link>
                          </li>
                        )}
                        {permsLower.includes('events.haa_approve') && (
                          <li>
                            <Link to="/haa/event-approvals" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/haa/event-approvals') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <ClipboardList className="w-4 h-4" /> <span>Event Approvals</span>
                            </Link>
                          </li>
                        )}
                      </ul>
                    )}

                    {/* Submenu for HOD Event Management group */}
                    {i.key === 'hod_event_management' && groupOpen && !collapsed && (
                      <ul className="pl-8 mt-1 space-y-1">
                        {permsLower.includes('events.create_proposal') && (
                          <li>
                            <Link to="/events/create-event" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/events/create-event') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <PartyPopper className="w-4 h-4" /> <span>Create Event</span>
                            </Link>
                          </li>
                        )}
                        {permsLower.includes('events.create_proposal') && (
                          <li>
                            <Link to="/events/my-proposals" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/events/my-proposals') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <FileText className="w-4 h-4" /> <span>My Proposals</span>
                            </Link>
                          </li>
                        )}
                        {permsLower.includes('events.hod_approve') && (
                          <li>
                            <Link to="/hod/event-approvals" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/hod/event-approvals') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <ClipboardList className="w-4 h-4" /> <span>Event Approvals</span>
                            </Link>
                          </li>
                        )}
                      </ul>
                    )}

                    {/* Submenu for Faculty Directory group */}
                    {i.key === 'faculty_directory' && groupOpen && !collapsed ? (
                      <ul className="pl-8 mt-1 space-y-1">
                        {canAccessFacultyDirectory && (
                          <li>
                            <Link to="/staffs" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/staffs') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <Users className="w-4 h-4" /> <span>Faculties</span>
                            </Link>
                          </li>
                        )}
                        {canAccessAdvisorAssign && (
                          <li>
                            <Link to="/hod/advisors" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/hod/advisors') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <Users className="w-4 h-4" /> <span>Advisor Assign</span>
                            </Link>
                          </li>
                        )}
                        {canAccessTeachingAssign && (
                          <li>
                            <Link to="/advisor/teaching" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/advisor/teaching') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <BookOpen className="w-4 h-4" /> <span>Teaching Assign</span>
                            </Link>
                          </li>
                        )}
                        {canAccessFacultyAttendance && (
                          <li>
                            <Link to="/hod/staff-attendance" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/hod/staff-attendance') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <Users className="w-4 h-4" /> <span>Faculty Attendance</span>
                            </Link>
                          </li>
                        )}
                        {canAccessIqacFacultyAttendance && (
                          <li>
                            <Link to="/faculty/attendance" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/faculty/attendance') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                              <Users className="w-4 h-4" /> <span>Faculty Attendance</span>
                            </Link>
                          </li>
                        )}
                      </ul>
                    ) : null}

                    {/* Submenu for Academic: show OBE Master and Due Dates.
                      Hidden when sidebar is collapsed and for IQAC role
                      (IQAC main account uses other IQAC tools instead). */}
                    {i.key === 'academic' && canObeMasterManage && expanded.academic && !collapsed && !isIqac ? (
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
                      <li>
                        <Link to={'/iqac/academic-controller?tab=internal_marks'} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${loc.pathname.startsWith('/iqac/academic-controller') && new URLSearchParams(loc.search).get('tab') === 'internal_marks' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => { if (window.innerWidth < 1024) toggle(); }}>
                          <Grid className="w-4 h-4" /> <span>Internal marks</span>
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
