"""
Management command: seed_features

Populates the FeatureCatalog with the complete set of subscribable modules.
Each entry includes:
  - applicable_roles: which user roles this feature is relevant to
  - sidebar_keys:     which sidebar item keys are hidden when this feature is disabled
Safe to run multiple times — uses get_or_create + update.
"""
from django.core.management.base import BaseCommand
from college.models import FeatureCatalog

FEATURES = [
    # ─────────────────── STUDENT ────────────────────────────────────────────
    {
        'code': 'attendance_student',
        'name': 'My Attendance (Student)',
        'category': 'Academics',
        'icon': 'ClipboardList',
        'description': 'Allows students to view their own attendance records and history.',
        'applicable_roles': 'STUDENT',
        'sidebar_keys': 'student_attendance',
        'sort_order': 10,
        'is_default': True,
    },
    {
        'code': 'marks_student',
        'name': 'My Marks (Student)',
        'category': 'Academics',
        'icon': 'BarChart2',
        'description': 'Allows students to view their internal and external mark reports.',
        'applicable_roles': 'STUDENT',
        'sidebar_keys': 'student_academics',
        'sort_order': 20,
        'is_default': True,
    },
    {
        'code': 'timetable_student',
        'name': 'Timetable View (Student)',
        'category': 'Academics',
        'icon': 'Calendar',
        'description': 'Allows students to view their class timetable.',
        'applicable_roles': 'STUDENT',
        'sidebar_keys': 'student_timetable',
        'sort_order': 30,
        'is_default': True,
    },
    {
        'code': 'curriculum_student',
        'name': 'My Curriculum (Student)',
        'category': 'Academics',
        'icon': 'BookOpen',
        'description': 'Allows students to view their scheme and curriculum mapping.',
        'applicable_roles': 'STUDENT',
        'sidebar_keys': 'student_curriculum_view',
        'sort_order': 40,
        'is_default': False,
    },
    {
        'code': 'elective_poll',
        'name': 'Elective Poll',
        'category': 'Academics',
        'icon': 'BookOpen',
        'description': 'Allows students and staff to view and select elective courses.',
        'applicable_roles': 'STUDENT,FACULTY,HOD,IQAC',
        'sidebar_keys': 'elective_poll',
        'sort_order': 45,
        'is_default': True,
    },
    {
        'code': 'lms',
        'name': 'Learning Management System (LMS)',
        'category': 'Academics',
        'icon': 'BookOpen',
        'description': 'Access LMS course materials, assignments, and test portals.',
        'applicable_roles': 'STUDENT,FACULTY,HOD,IQAC',
        'sidebar_keys': 'lms',
        'sort_order': 48,
        'is_default': True,
    },
    {
        'code': 'applications_student',
        'name': 'My Applications (Student)',
        'category': 'Administration',
        'icon': 'Layout',
        'description': 'Allows students to submit leave and other workflow applications.',
        'applicable_roles': 'STUDENT',
        'sidebar_keys': 'applications_home',
        'sort_order': 50,
        'is_default': True,
    },
    {
        'code': 'certificates_student',
        'name': 'My Certificates (Student)',
        'category': 'Quality',
        'icon': 'FileText',
        'description': 'Allows students to upload and track external certificates and achievements.',
        'applicable_roles': 'STUDENT',
        'sidebar_keys': 'certificates_upload',
        'sort_order': 55,
        'is_default': True,
    },

    # ─────────────────── FACULTY / STAFF ─────────────────────────────────────
    {
        'code': 'attendance_marking',
        'name': 'Attendance Marking (Faculty)',
        'category': 'Academics',
        'icon': 'ClipboardList',
        'description': 'Allows faculty to mark period-wise attendance for their classes.',
        'applicable_roles': 'FACULTY,HOD,ADVISOR',
        'sidebar_keys': 'period_attendance',
        'sort_order': 110,
        'is_default': True,
    },
    {
        'code': 'attendance_analytics',
        'name': 'Attendance Analytics (Staff)',
        'category': 'Academics',
        'icon': 'BarChart2',
        'description': 'Provides faculty, HOD, and IQAC with attendance analytics dashboards.',
        'applicable_roles': 'FACULTY,HOD,IQAC',
        'sidebar_keys': 'attendance_analytics',
        'sort_order': 120,
        'is_default': True,
    },
    {
        'code': 'timetable_staff',
        'name': 'Timetable (Staff)',
        'category': 'Academics',
        'icon': 'Calendar',
        'description': 'Allows staff to view their personal timetable and manage assignments.',
        'applicable_roles': 'FACULTY,HOD,ADVISOR',
        'sidebar_keys': 'staff_timetable,timetable_assignments',
        'sort_order': 130,
        'is_default': True,
    },
    {
        'code': 'assigned_subjects',
        'name': 'Assigned Subjects (Faculty)',
        'category': 'Academics',
        'icon': 'BookOpen',
        'description': 'Shows the courses assigned to each faculty member for the semester.',
        'applicable_roles': 'FACULTY,HOD',
        'sidebar_keys': 'assigned_subjects',
        'sort_order': 140,
        'is_default': True,
    },
    {
        'code': 'obe',
        'name': 'OBE Engine (Faculty)',
        'category': 'Academics',
        'icon': 'BarChart2',
        'description': 'Outcome-Based Education: CO/PO mapping, marks entry, attainment reports.',
        'applicable_roles': 'FACULTY,HOD,ADVISOR',
        'sidebar_keys': 'academic',
        'sort_order': 150,
        'is_default': False,
    },
    {
        'code': 'curriculum_dept',
        'name': 'Department Curriculum (Faculty/HOD)',
        'category': 'Academics',
        'icon': 'BookOpen',
        'description': 'Allows departments to fill and approve their curriculum data.',
        'applicable_roles': 'FACULTY,HOD',
        'sidebar_keys': 'department_curriculum',
        'sort_order': 160,
        'is_default': False,
    },
    {
        'code': 'result_analysis',
        'name': 'Result Analysis (HOD)',
        'category': 'Academics',
        'icon': 'BarChart2',
        'description': 'HOD and Advisor dashboard for end-semester result analytics.',
        'applicable_roles': 'HOD,ADVISOR',
        'sidebar_keys': 'hod_result_analysis',
        'sort_order': 170,
        'is_default': False,
    },
    {
        'code': 'mentor_assign',
        'name': 'Mentor Assignment (Advisor)',
        'category': 'Academics',
        'icon': 'Users',
        'description': 'Allows advisors to assign student mentors.',
        'applicable_roles': 'ADVISOR,HOD',
        'sidebar_keys': 'mentor_assign',
        'sort_order': 180,
        'is_default': False,
    },
    {
        'code': 'my_calendar',
        'name': 'My Calendar / Leave Tracker (Staff)',
        'category': 'HR',
        'icon': 'Calendar',
        'description': 'Staff personal attendance calendar, leave request tracking.',
        'applicable_roles': 'FACULTY,HOD,ADVISOR',
        'sidebar_keys': 'my_attendance',
        'sort_order': 210,
        'is_default': True,
    },
    {
        'code': 'staff_salary',
        'name': 'Salary Slip (Staff)',
        'category': 'HR',
        'icon': 'Wallet',
        'description': 'Allows staff to view and download their monthly salary slips.',
        'applicable_roles': 'FACULTY,HOD',
        'sidebar_keys': 'staff_salary',
        'sort_order': 220,
        'is_default': False,
    },
    {
        'code': 'staff_requests',
        'name': 'Leave & Request Approvals',
        'category': 'HR',
        'icon': 'Bell',
        'description': 'Enables the leave/duty/swap request workflow and approval queues.',
        'applicable_roles': 'FACULTY,HOD,AHOD,IQAC,HR,PS,PRINCIPAL,ADMIN',
        'sidebar_keys': 'staff_requests_approvals',
        'sort_order': 230,
        'is_default': True,
    },
    {
        'code': 'requests_hub',
        'name': 'Requests Hub',
        'category': 'HR',
        'icon': 'Bell',
        'description': 'Central hub to view and approve various requests (attendance, leaves, profiles, etc.).',
        'applicable_roles': 'FACULTY,HOD,AHOD,IQAC,HR,PS,PRINCIPAL,ADMIN',
        'sidebar_keys': 'requests_hub',
        'sort_order': 240,
        'is_default': True,
    },
    {
        'code': 'feedback',
        'name': 'Student Feedback',
        'category': 'Quality',
        'icon': 'MessageCircle',
        'description': 'Enables the student feedback collection and staff reply system.',
        'applicable_roles': 'FACULTY,HOD,IQAC',
        'sidebar_keys': 'feedback',
        'sort_order': 310,
        'is_default': False,
    },
    {
        'code': 'events',
        'name': 'Event Management',
        'category': 'Quality',
        'icon': 'PartyPopper',
        'description': 'Event proposal creation and multi-level approval workflows.',
        'applicable_roles': 'FACULTY,HOD,HAA,IQAC',
        'sidebar_keys': 'create_event,my_proposals,hod_event_management,haa_event_management,iqac_event_approvals,hod_event_approvals',
        'sort_order': 320,
        'is_default': True,
    },
    {
        'code': 'announcements',
        'name': 'Announcements',
        'category': 'Communication',
        'icon': 'Bell',
        'description': 'Campus-wide and targeted role-based announcement board.',
        'applicable_roles': 'FACULTY,HOD,IQAC,STUDENT',
        'sidebar_keys': 'announcements',
        'sort_order': 410,
        'is_default': True,
    },
    {
        'code': 'applications_staff',
        'name': 'Applications Hub (Staff)',
        'category': 'Administration',
        'icon': 'Layout',
        'description': 'Staff access to the applications inbox and workflow management.',
        'applicable_roles': 'FACULTY,HOD,AHOD,HR,HAA,IQAC,PS,PRINCIPAL',
        'sidebar_keys': 'applications_home,applications_inbox',
        'sort_order': 510,
        'is_default': True,
    },

    # ─────────────────── IQAC / ADMIN ────────────────────────────────────────
    {
        'code': 'curriculum_master',
        'name': 'Curriculum Master (IQAC)',
        'category': 'Academics',
        'icon': 'BookOpen',
        'description': 'IQAC master curriculum editor: create, edit, publish schemes.',
        'applicable_roles': 'IQAC',
        'sidebar_keys': 'curriculum_master,elective_import',
        'sort_order': 610,
        'is_default': False,
    },
    {
        'code': 'timetable_admin',
        'name': 'Timetable Templates (IQAC)',
        'category': 'Academics',
        'icon': 'Calendar',
        'description': 'IQAC timetable template builder and master schedule management.',
        'applicable_roles': 'IQAC',
        'sidebar_keys': 'timetable_templates',
        'sort_order': 620,
        'is_default': False,
    },
    {
        'code': 'obe_admin',
        'name': 'Academic Controller (IQAC)',
        'category': 'Academics',
        'icon': 'BarChart2',
        'description': 'IQAC OBE oversight: due dates, master requests, course-level marks.',
        'applicable_roles': 'IQAC',
        'sidebar_keys': 'academic_controller,obe_due_dates',
        'sort_order': 630,
        'is_default': False,
    },
    {
        'code': 'pbas',
        'name': 'PBAS Manager',
        'category': 'Quality',
        'icon': 'ClipboardList',
        'description': 'Performance-Based Appraisal System management for IQAC and Principal.',
        'applicable_roles': 'IQAC,PRINCIPAL,PS,ADMIN',
        'sidebar_keys': 'pbas_manager',
        'sort_order': 640,
        'is_default': False,
    },
    {
        'code': 'faculty_directory',
        'name': 'Faculty Directory',
        'category': 'Administration',
        'icon': 'Users',
        'description': 'View and manage staff directory, HOD advisor assignments, and attendance.',
        'applicable_roles': 'IQAC,HOD,PS',
        'sidebar_keys': 'faculty_directory',
        'sort_order': 650,
        'is_default': True,
    },
    {
        'code': 'student_directory',
        'name': 'Student Directory (Admin)',
        'category': 'Administration',
        'icon': 'GraduationCap',
        'description': 'Admin and IQAC access to search and view all student profiles.',
        'applicable_roles': 'IQAC,PS',
        'sidebar_keys': 'staff_students',
        'sort_order': 660,
        'is_default': False,
    },
    {
        'code': 'applications_admin',
        'name': 'Applications Admin (IQAC)',
        'category': 'Administration',
        'icon': 'Layout',
        'description': 'IQAC/Admin panel for managing application types and form templates.',
        'applicable_roles': 'IQAC',
        'sidebar_keys': 'applications_admin',
        'sort_order': 670,
        'is_default': False,
    },
    {
        'code': 'settings',
        'name': 'System Settings (IQAC)',
        'category': 'Administration',
        'icon': 'Settings',
        'description': 'IQAC system settings including notification templates and WhatsApp config.',
        'applicable_roles': 'IQAC',
        'sidebar_keys': 'settings',
        'sort_order': 680,
        'is_default': False,
    },
    {
        'code': 'external_management',
        'name': 'External Management (IQAC)',
        'category': 'Administration',
        'icon': 'Users',
        'description': 'Manage external staff profiles and visitor records.',
        'applicable_roles': 'IQAC',
        'sidebar_keys': 'external_management',
        'sort_order': 690,
        'is_default': False,
    },
    {
        'code': 'rf_reader',
        'name': 'RF Reader (IQAC)',
        'category': 'Security',
        'icon': 'ScanLine',
        'description': 'RFID reader management interface for IQAC.',
        'applicable_roles': 'IQAC',
        'sidebar_keys': 'rf_reader',
        'sort_order': 700,
        'is_default': False,
    },

    # ─────────────────── HR ──────────────────────────────────────────────────
    {
        'code': 'hr_management',
        'name': 'HR Management',
        'category': 'HR',
        'icon': 'UserCheck',
        'description': 'HR role features: request templates, gate management, payroll, staff validation.',
        'applicable_roles': 'HR',
        'sidebar_keys': 'hr_request_templates,hr_manage_gate,hr_gatepass_logs,hr_staff_attendance_analytics,hr_staff_validation,hr_staff_salary',
        'sort_order': 810,
        'is_default': False,
    },
    {
        'code': 'ps_attendance',
        'name': 'Staff Attendance Upload (PS)',
        'category': 'HR',
        'icon': 'UserCheck',
        'description': 'Principal Secretary can upload and view all staff attendance records.',
        'applicable_roles': 'PS',
        'sidebar_keys': 'ps_staff_attendance,ps_staff_attendance_view',
        'sort_order': 820,
        'is_default': False,
    },

    # ─────────────────── COE ─────────────────────────────────────────────────
    {
        'code': 'coe',
        'name': 'COE Portal',
        'category': 'Examinations',
        'icon': 'Shield',
        'description': 'Controller of Examinations: registrations, bundle allocation, result retrieval.',
        'applicable_roles': 'COE',
        'sidebar_keys': 'coe_portal,coe_students_list,coe_course_list,coe_arrear_list,coe_bundle_allocation,coe_bar_scan,coe_bar_scan_entry,coe_retrival,coe_one_page_report',
        'sort_order': 910,
        'is_default': False,
    },
    {
        'code': 'question_bank',
        'name': 'Question Bank',
        'category': 'Examinations',
        'icon': 'FileText',
        'description': 'Question repository management and online test builder.',
        'applicable_roles': 'FACULTY,HOD,IQAC',
        'sidebar_keys': '',
        'sort_order': 920,
        'is_default': False,
    },

    # ─────────────────── SECURITY / LIBRARY ──────────────────────────────────
    {
        'code': 'idcsscan',
        'name': 'RFID & Gate Security',
        'category': 'Security',
        'icon': 'ScanLine',
        'description': 'RFID card assignment, gatepass scanning, and gate entry dashboard.',
        'applicable_roles': 'SECURITY,LIBRARY',
        'sidebar_keys': 'idscan_test,idscan_assign_cards,idscan_bulk_entry,idscan_cards_data,idscan_gatepass,idscan_gatescan',
        'sort_order': 1010,
        'is_default': False,
    },
    {
        'code': 'certificates_review',
        'name': 'Certificate Reviews (Staff/Mentor)',
        'category': 'Quality',
        'icon': 'FileText',
        'description': 'Allows mentors and staff to review and approve student certificates.',
        'applicable_roles': 'FACULTY,HOD,ADVISOR',
        'sidebar_keys': 'certificates_review,certificates_achievements',
        'sort_order': 1020,
        'is_default': True,
    },
    {
        'code': 'certificates_reports',
        'name': 'Achievement Reports (IQAC)',
        'category': 'Quality',
        'icon': 'BarChart2',
        'description': 'IQAC interface to generate and export student achievement reports.',
        'applicable_roles': 'IQAC',
        'sidebar_keys': 'certificates_reports',
        'sort_order': 1030,
        'is_default': True,
    },
    {
        'code': 'queries',
        'name': 'Raise Token / Support Queries',
        'category': 'Support',
        'icon': 'MessageCircle',
        'description': 'Support ticket system for raising queries and issue resolution.',
        'applicable_roles': 'STUDENT,FACULTY,HOD,ADVISOR,IQAC,HR,SECURITY,COE',
        'sidebar_keys': 'queries',
        'sort_order': 1040,
        'is_default': True,
    },
]


class Command(BaseCommand):
    help = 'Seed the FeatureCatalog with the complete set of subscribable modules.'

    def handle(self, *args, **options):
        # Local mapping of features to permissions
        PERMISSIONS_MAPPING = {
            'attendance_marking': ['staff_attendance.manage_attendance'],
            'attendance_analytics': ['staff_attendance.view_attendance_records', 'academics.view_all_attendance', 'academics.view_attendance_overall', 'academics.view_all_departments', 'academics.view_department_attendance', 'academics.view_class_attendance', 'academics.view_section_attendance'],
            'obe': ['obe.view', 'obe.master.manage'],
            'curriculum_master': ['curriculum.manage', 'curriculum.import_elective_choices'],
            'curriculum_dept': ['obe.cdap.upload'],
            'result_analysis': ['analytics.view_class_analytics'],
            'student_directory': ['students.view_all_students', 'students.view_department_students', 'academics.view_my_students', 'academics.view_mentees'],
            'faculty_directory': ['academics.view_staffs_page', 'academics.assign_teaching', 'academics.assign_advisor', 'academics.view_attendance_overall'],
            'staff_requests': ['staff_attendance.view_upload_logs', 'staff_requests.manage_templates', 'staff_requests.approve_requests'],
            'requests_hub': ['applications.view_any_application'],
            'applications_admin': ['applications.view_any_application', 'applications.manage_categories'],
            'external_management': ['academics.manage_external_staff'],
            'coe': ['coe.portal.access', 'coe.manage.exams', 'coe.manage.results', 'coe.manage.circulars', 'coe.manage.calendar'],
            'idcsscan': ['idcsscan.scan', 'idscan.assign_cards'],
            'rf_reader': ['idscan.assign_cards'],
            'announcements': ['announcements.view_announcement_page', 'announcements.create_announcement', 'announcements.manage_announcement'],
            'feedback': ['feedback.feedback_page'],
            'branding': ['branding.access', 'branding.list_posters'],
            'events': ['events.create_proposal', 'events.hod_approve', 'events.haa_approve', 'events.branding_review', 'events.bulk_delete_proposals'],
        }
        
        from accounts.models import Permission

        created_count = 0
        updated_count = 0

        for feat in FEATURES:
            obj, created = FeatureCatalog.objects.get_or_create(
                code=feat['code'],
                defaults={k: v for k, v in feat.items() if k != 'code'},
            )
            
            changed = False
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created: {feat["code"]}'))
            else:
                for field in ('name', 'description', 'category', 'icon', 'is_default',
                              'sort_order', 'applicable_roles', 'sidebar_keys'):
                    val = feat.get(field, getattr(obj, field))
                    if getattr(obj, field) != val:
                        setattr(obj, field, val)
                        changed = True
                if changed:
                    obj.save()
                    updated_count += 1
                    self.stdout.write(self.style.WARNING(f'  ↻ Updated: {feat["code"]}'))
                else:
                    self.stdout.write(f'  · Unchanged: {feat["code"]}')
            
            # Map permissions
            if feat['code'] in PERMISSIONS_MAPPING:
                perms = []
                for p_code in PERMISSIONS_MAPPING[feat['code']]:
                    p, _ = Permission.objects.get_or_create(code=p_code)
                    perms.append(p)
                obj.permissions.set(perms)

        total = len(FEATURES)
        self.stdout.write(self.style.SUCCESS(
            f'\nDone. {created_count} created, {updated_count} updated, {total} total features.'
        ))
