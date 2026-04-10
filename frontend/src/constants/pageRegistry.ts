export type PageEntry = {
  /** URL path that ProtectedRoute protects */
  path: string
  /** Human-readable name shown on the card */
  label: string
  /** Lucide icon name (must match ICON_MAP in the manager page) */
  icon: string
  /** Category / section badge */
  group: string
  /**
   * The roles or profile-types that can access this page.
   * Use exact strings so ProtectedRoute can match them:
   *   - Role names  : STUDENT, STAFF, HOD, IQAC, ADVISOR, SECURITY, LIBRARY, HR, ADMIN
   *   - Profile types are already normalised to STUDENT / STAFF above
   */
  roles: string[]
}

export const PAGE_REGISTRY: PageEntry[] = [
  // ── Student ──────────────────────────────────────────────────────────────
  { path: '/student/timetable',          label: 'Timetable',                     icon: 'Clock',         group: 'Student',  roles: ['STUDENT'] },
  { path: '/student/attendance',         label: 'Attendance',                    icon: 'CalendarCheck', group: 'Student',  roles: ['STUDENT'] },
  { path: '/student/academics',          label: 'Academics',                     icon: 'BookOpen',      group: 'Student',  roles: ['STUDENT'] },
  { path: '/student/calendar',           label: 'Academic Calendar',             icon: 'CalendarDays',  group: 'Student',  roles: ['STUDENT'] },
  { path: '/student/feedback',           label: 'Feedback',                      icon: 'Star',          group: 'Student',  roles: ['STUDENT'] },

  // ── Staff ─────────────────────────────────────────────────────────────────
  { path: '/staff/timetable',            label: 'Timetable',                     icon: 'Clock',         group: 'Staff',    roles: ['STAFF'] },
  { path: '/staff/assigned-subjects',    label: 'Assigned Subjects',             icon: 'BookMarked',    group: 'Staff',    roles: ['STAFF'] },
  { path: '/staff/students',             label: 'My Students',                   icon: 'Users',         group: 'Staff',    roles: ['STAFF'] },
  { path: '/staff/period-attendance',    label: 'Period Attendance',             icon: 'CalendarCheck', group: 'Staff',    roles: ['STAFF'] },
  { path: '/staff/attendance-analytics', label: 'Attendance Analytics',          icon: 'BarChart2',     group: 'Staff',    roles: ['STAFF'] },
  { path: '/my-attendance',              label: 'My Attendance',                 icon: 'BarChart2',     group: 'Staff',    roles: ['STAFF'] },
  { path: '/staff/salary',               label: 'Salary',                        icon: 'DollarSign',    group: 'Staff',    roles: ['STAFF'] },
  { path: '/staff/pbas',                 label: 'PBAS Submission',               icon: 'PenLine',       group: 'Staff',    roles: ['STAFF'] },
  { path: '/my-requests',                label: 'My Requests',                   icon: 'ClipboardList', group: 'Staff',    roles: ['STAFF'] },
  { path: '/pending-approvals',          label: 'Pending Approvals',             icon: 'CheckSquare',   group: 'Staff',    roles: ['STAFF', 'HOD'] },

  // ── Common / Shared ───────────────────────────────────────────────────────
  { path: '/feedback',                   label: 'Feedback',                      icon: 'Star',          group: 'Common',   roles: ['STAFF', 'IQAC'] },
  { path: '/queries',                    label: 'Queries',                       icon: 'MessageSquare', group: 'Common',   roles: ['STUDENT', 'STAFF'] },
  { path: '/announcements',              label: 'Announcements',                 icon: 'Bell',          group: 'Common',   roles: ['STAFF', 'HOD', 'IQAC'] },
  { path: '/applications',               label: 'My Applications',               icon: 'FileText',      group: 'Common',   roles: ['STUDENT', 'STAFF', 'HOD'] },
  { path: '/applications/inbox',         label: 'Applications Inbox',            icon: 'Inbox',         group: 'Common',   roles: ['HOD', 'IQAC', 'STAFF'] },
  { path: '/poster-maker',               label: 'Poster Maker',                  icon: 'Layers',        group: 'Common',   roles: ['HOD', 'IQAC', 'STAFF'] },
  { path: '/events/my-proposals',        label: 'My Event Proposals',            icon: 'CalendarDays',  group: 'Common',   roles: ['STAFF'] },

  // ── HOD ───────────────────────────────────────────────────────────────────
  { path: '/hod/advisors',               label: 'Advisor Assignments',           icon: 'UserCheck',     group: 'HOD',      roles: ['HOD'] },
  { path: '/hod/obe-requests',           label: 'OBE Edit Requests',             icon: 'ClipboardList', group: 'HOD',      roles: ['HOD'] },
  { path: '/hod/result-analysis',        label: 'Result Analysis',               icon: 'BarChart2',     group: 'HOD',      roles: ['HOD', 'ADVISOR'] },
  { path: '/hod/events',                 label: 'Events',                        icon: 'CalendarDays',  group: 'HOD',      roles: ['HOD'] },
  { path: '/hod/event-approvals',        label: 'Event Approvals',               icon: 'CheckSquare',   group: 'HOD',      roles: ['HOD'] },
  { path: '/hod/staff-attendance',       label: 'Staff Attendance',              icon: 'UserCheck',     group: 'HOD',      roles: ['HOD'] },
  { path: '/hod/calendar',               label: 'Academic Calendar',             icon: 'CalendarDays',  group: 'HOD',      roles: ['HOD'] },
  { path: '/advisor/teaching',           label: 'Teaching Assignments',          icon: 'BookOpen',      group: 'HOD',      roles: ['HOD', 'ADVISOR'] },

  // ── IQAC ──────────────────────────────────────────────────────────────────
  { path: '/iqac/calendar',              label: 'Academic Calendar',             icon: 'CalendarDays',  group: 'IQAC',     roles: ['IQAC'] },
  { path: '/iqac/timetable',             label: 'Timetable',                     icon: 'Clock',         group: 'IQAC',     roles: ['IQAC'] },
  { path: '/iqac/academic-controller',   label: 'Academic Controller',           icon: 'Settings',      group: 'IQAC',     roles: ['IQAC'] },
  { path: '/iqac/staff-attendance',      label: 'Staff Attendance',              icon: 'UserCheck',     group: 'IQAC',     roles: ['IQAC'] },
  { path: '/iqac/obe-requests',          label: 'OBE Requests',                  icon: 'ClipboardList', group: 'IQAC',     roles: ['IQAC'] },
  { path: '/iqac/event-approvals',       label: 'Event Approvals',               icon: 'CheckSquare',   group: 'IQAC',     roles: ['IQAC'] },
  { path: '/iqac/applications-admin',    label: 'Applications Admin',            icon: 'Inbox',         group: 'IQAC',     roles: ['IQAC'] },
  { path: '/iqac/pbas',                  label: 'PBAS Manager',                  icon: 'PenLine',       group: 'IQAC',     roles: ['IQAC'] },

  // ── Advisor ───────────────────────────────────────────────────────────────
  { path: '/advisor/timetable',          label: 'Timetable',                     icon: 'Clock',         group: 'Advisor',  roles: ['ADVISOR'] },
  { path: '/advisor/mentor',             label: 'Mentor Assign',                 icon: 'UserPlus',      group: 'Advisor',  roles: ['ADVISOR'] },

  // ── RFID / Security / Library ─────────────────────────────────────────────
  { path: '/idscan/test',                label: 'RFID Scanner Test',             icon: 'ScanLine',      group: 'RFID',     roles: ['SECURITY'] },
  { path: '/idscan/assign-cards',        label: 'Card Assignment',               icon: 'CreditCard',    group: 'RFID',     roles: ['SECURITY', 'LIBRARY'] },
  { path: '/idscan/bulk-entry',          label: 'Bulk RFID Entry',               icon: 'ScanLine',      group: 'RFID',     roles: ['LIBRARY', 'SECURITY', 'IQAC'] },
  { path: '/idscan/cards-data',          label: 'Cards Data',                    icon: 'Database',      group: 'RFID',     roles: ['LIBRARY', 'SECURITY', 'IQAC'] },
  { path: '/idscan/gatepass',            label: 'Gatepass Scanner',              icon: 'ScanLine',      group: 'RFID',     roles: ['SECURITY'] },
  { path: '/idscan/gatescan',            label: 'GateScan',                      icon: 'ScanLine',      group: 'RFID',     roles: ['SECURITY'] },
  { path: '/idscan/fingerprint',         label: 'Fingerprint Enroll',            icon: 'Fingerprint',   group: 'RFID',     roles: ['LIBRARY', 'SECURITY', 'IQAC'] },

  // ── HR ────────────────────────────────────────────────────────────────────
  { path: '/hr/request-templates',       label: 'Request Templates',             icon: 'FileText',      group: 'HR',       roles: ['HR'] },
  { path: '/hr/manage-gate',             label: 'Manage Gate',                   icon: 'Shield',        group: 'HR',       roles: ['HR', 'SECURITY'] },
  { path: '/hr/gatepass-logs',           label: 'GatePass Logs',                 icon: 'History',       group: 'HR',       roles: ['HR'] },
  { path: '/hr/staff-attendance-analytics', label: 'Staff Attendance Analytics', icon: 'BarChart2',     group: 'HR',       roles: ['HR'] },
  { path: '/hr/staff-validation',        label: 'Staff Validation',              icon: 'UserCheck',     group: 'HR',       roles: ['HR'] },
  { path: '/hr/staff-salary',            label: 'Staff Salary',                  icon: 'DollarSign',    group: 'HR',       roles: ['HR'] },
]
