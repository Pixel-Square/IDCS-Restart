import os
import sys
import uuid
from datetime import date, timedelta
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pbas_backend.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
from accounts.models import Role, Department, College, StaffProfile, StudentProfile, StudentMentorMap
from pbas_core.models import (
    PBASCustomDepartment,
    PBASNode,
    PBASApprovalFlow,
    PBASDuration,
    PBASSubmission,
)

User = get_user_model()

def seed():
    print("🌱 Starting PBAS Database Seeding...")

    # 1. Roles
    roles = {}
    role_names = [
        ('FACULTY', 'Teaching Faculty / Staff Submitter'),
        ('STAFF', 'General Staff Member'),
        ('HOD', 'Head of the Department (First-tier Approver)'),
        ('PRINCIPAL', 'Principal / Dean (Final Authority Approver)'),
        ('IQAC', 'Internal Quality Assurance Cell Coordinator'),
        ('PBAS_ADMIN', 'Appraisal System Administrator'),
        ('PBAS_APPROVER', 'Designated Committee Reviewer'),
        ('STUDENT', 'Student Submitter'),
        ('MENTOR', 'Faculty Mentor'),
    ]
    for name, desc in role_names:
        r, _ = Role.objects.get_or_create(name=name, defaults={'description': desc})
        roles[name] = r
    print(f"✅ Created {len(roles)} roles.")

    # 2. Departments
    departments = {}
    dept_data = [
        ('CSE', 'Computer Science and Engineering', 'CSE'),
        ('IT', 'Information Technology', 'IT'),
        ('AIDS', 'Artificial Intelligence and Data Science', 'AIDS'),
        ('ECE', 'Electronics and Communication Engineering', 'ECE'),
        ('MECH', 'Mechanical Engineering', 'MECH'),
        ('IQAC_DEPT', 'Internal Quality Assurance Cell', 'IQAC'),
    ]
    for code, name, short in dept_data:
        d, _ = Department.objects.get_or_create(code=code, defaults={'name': name, 'short_name': short})
        departments[code] = d
    print(f"✅ Created {len(departments)} departments.")

    # 3. College
    college, _ = College.objects.get_or_create(
        code='KRGI',
        defaults={'name': 'KPR Institute of Engineering and Technology', 'short_name': 'KPRIET'}
    )
    print(f"✅ Created College: {college.name}")

    # 4. Users & Profiles
    users_data = [
        {
            'email': 'faculty@pbas.edu',
            'username': 'aris.thorne',
            'first_name': 'Dr. Aris',
            'last_name': 'Thorne',
            'roles': ['FACULTY', 'STAFF'],
            'is_staff': False,
            'is_superuser': False,
            'profile_type': 'staff',
            'staff_id': 'CSE_FAC_01',
            'dept': 'CSE',
            'designation': 'Associate Professor',
            'credits': {'total': 48, 'academics': 25, 'student_dev': 8, 'rd': 10, 'inst': 5},
        },
        {
            'email': 'hod@pbas.edu',
            'username': 'rajesh.hod',
            'first_name': 'Prof. Rajesh',
            'last_name': 'K',
            'roles': ['HOD', 'PBAS_APPROVER', 'FACULTY', 'STAFF'],
            'is_staff': True,
            'is_superuser': False,
            'profile_type': 'staff',
            'staff_id': 'CSE_HOD_01',
            'dept': 'CSE',
            'designation': 'Professor & Head of Department',
            'credits': {'total': 82, 'academics': 35, 'student_dev': 15, 'rd': 22, 'inst': 10},
        },
        {
            'email': 'principal@pbas.edu',
            'username': 'meenakshi.principal',
            'first_name': 'Dr. Meenakshi',
            'last_name': 'S',
            'roles': ['PRINCIPAL', 'PBAS_APPROVER', 'STAFF'],
            'is_staff': True,
            'is_superuser': False,
            'profile_type': 'staff',
            'staff_id': 'PRIN_01',
            'dept': 'IQAC_DEPT',
            'designation': 'Principal',
            'credits': {'total': 95, 'academics': 40, 'student_dev': 15, 'rd': 30, 'inst': 10},
        },
        {
            'email': 'iqac@pbas.edu',
            'username': 'suresh.iqac',
            'first_name': 'Dr. Suresh',
            'last_name': 'V',
            'roles': ['IQAC', 'PBAS_ADMIN', 'ADMIN', 'STAFF'],
            'is_staff': True,
            'is_superuser': True,
            'profile_type': 'staff',
            'staff_id': 'IQAC_01',
            'dept': 'IQAC_DEPT',
            'designation': 'IQAC Director & Dean Academic Affairs',
            'credits': {'total': 90, 'academics': 35, 'student_dev': 15, 'rd': 25, 'inst': 15},
        },
        {
            'email': 'student@pbas.edu',
            'username': 'aditi.student',
            'first_name': 'Aditi',
            'last_name': 'Sharma',
            'roles': ['STUDENT'],
            'is_staff': False,
            'is_superuser': False,
            'profile_type': 'student',
            'reg_no': '7376221CS101',
            'dept': 'CSE',
            'batch': '2022-2026',
            'credits': 15,
        },
    ]

    created_users = {}
    for udata in users_data:
        u, created = User.objects.get_or_create(
            email=udata['email'],
            defaults={
                'username': udata['username'],
                'first_name': udata['first_name'],
                'last_name': udata['last_name'],
                'is_staff': udata['is_staff'],
                'is_superuser': udata['is_superuser'],
            }
        )
        u.set_password('password123')
        u.save()
        u.roles.set([roles[r] for r in udata['roles'] if r in roles])
        created_users[udata['email']] = u

        if udata['profile_type'] == 'staff':
            cinfo = udata['credits']
            sp, _ = StaffProfile.objects.get_or_create(
                user=u,
                defaults={
                    'staff_id': udata['staff_id'],
                    'department': departments.get(udata['dept']),
                    'designation': udata['designation'],
                    'pbas_credit': cinfo['total'],
                    'pbas_academics_credit': cinfo['academics'],
                    'pbas_student_development_credit': cinfo['student_dev'],
                    'pbas_research_development_credit': cinfo['rd'],
                    'pbas_institutional_contribution_credit': cinfo['inst'],
                }
            )
        elif udata['profile_type'] == 'student':
            stu, _ = StudentProfile.objects.get_or_create(
                user=u,
                defaults={
                    'reg_no': udata['reg_no'],
                    'home_department': departments.get(udata['dept']),
                    'batch': udata.get('batch', '2022-2026'),
                    'pbas_credit': udata.get('credits', 0),
                }
            )
    print("✅ Created demo users: Faculty, HOD, Principal, IQAC Admin, Student.")

    # 5. Approval Flow
    flow, _ = PBASApprovalFlow.objects.get_or_create(
        id=1,
        defaults={
            'staff_flow': ["HOD", "PRINCIPAL"],
            'student_flow': ["MENTOR", "HOD", "PRINCIPAL"],
        }
    )
    print("✅ Configured PBAS Approval Flow.")

    # 6. PBAS Duration Cycle
    PBASDuration.objects.all().delete()
    cycle = PBASDuration.objects.create(
        title='Annual Appraisal Cycle 2025-2026',
        start_date=date(2025, 6, 1),
        end_date=date(2026, 5, 31),
    )
    print(f"✅ Created PBAS Duration: {cycle.title}")

    # 7. Custom Department & Tree Nodes
    master_dept, _ = PBASCustomDepartment.objects.get_or_create(
        id=uuid.UUID('00000000-0000-0000-0000-000000000001'),
        defaults={
            'title': 'Institutional PBAS Master Framework',
            'show_in_submission': True,
            'accesses': [],
            'created_by': created_users['iqac@pbas.edu'],
        }
    )

    # Clean existing nodes
    master_dept.nodes.all().delete()

    # Part A: Teaching & Academics (40 Max)
    part_a = PBASNode.objects.create(
        department=master_dept,
        label='Part A: Teaching, Learning and Evaluation (Max 40 Marks)',
        limit=40,
        position=1,
        audience='both',
    )
    node_a1 = PBASNode.objects.create(
        department=master_dept,
        parent=part_a,
        label='A1. Classroom & Laboratory Direct Instruction (>90% compliance)',
        pbas_credit=15,
        limit=15,
        input_mode='upload',
        position=1,
        audience='both',
        form_schema=[
            {'id': 'f1', 'label': 'Course Code & Name', 'field_type': 'short_text', 'required': True},
            {'id': 'f2', 'label': 'Classes Scheduled vs Handled', 'field_type': 'short_text', 'required': True},
            {'id': 'f3', 'label': 'Student Pass Percentage (%)', 'field_type': 'short_text', 'required': True},
        ]
    )
    node_a2 = PBASNode.objects.create(
        department=master_dept,
        parent=part_a,
        label='A2. Innovative Pedagogies, Flipped Classroom & LMS Usage',
        pbas_credit=10,
        limit=10,
        input_mode='link',
        position=2,
        audience='both',
        form_schema=[
            {'id': 'f1', 'label': 'Tool / Platform Used (Canvas, Moodle, Google Classroom)', 'field_type': 'short_text', 'required': True},
            {'id': 'f2', 'label': 'LMS Course URL', 'field_type': 'short_text', 'required': True},
        ]
    )

    # Part B: Student Development (20 Max)
    part_b = PBASNode.objects.create(
        department=master_dept,
        label='Part B: Student Development & Co-Curricular Mentoring (Max 20 Marks)',
        limit=20,
        position=2,
        audience='both',
    )
    node_b1 = PBASNode.objects.create(
        department=master_dept,
        parent=part_b,
        label='B1. Hackathons, Project Expos & National Competitions Mentored',
        pbas_credit=10,
        limit=10,
        input_mode='upload',
        position=1,
        audience='both',
        form_schema=[
            {'id': 'f1', 'label': 'Competition / Hackathon Title', 'field_type': 'short_text', 'required': True},
            {'id': 'f2', 'label': 'Award / Prize Won or Finalist Rank', 'field_type': 'short_text', 'required': True},
            {'id': 'f3', 'label': 'Participating Student Reg Nos', 'field_type': 'long_text', 'required': True},
        ]
    )

    # Part C: Research & Development (30 Max)
    part_c = PBASNode.objects.create(
        department=master_dept,
        label='Part C: Research and Development Activities (Max 30 Marks)',
        limit=30,
        position=3,
        audience='both',
    )
    r1_pub = PBASNode.objects.create(
        department=master_dept,
        parent=part_c,
        label='R1. Research Publications in Scopus / Web of Science',
        limit=20,
        position=1,
        audience='both',
    )
    node_c1 = PBASNode.objects.create(
        department=master_dept,
        parent=r1_pub,
        label='R1.1 Refereed Journals Indexed in Scopus / SCI (First / Corresponding Author: 10, Co-Author: 6)',
        pbas_credit=10,
        input_mode='upload',
        position=1,
        audience='both',
        form_schema=[
            {'id': 'f1', 'label': 'Article Title', 'field_type': 'short_text', 'required': True},
            {'id': 'f2', 'label': 'Journal Name', 'field_type': 'short_text', 'required': True},
            {'id': 'f3', 'label': 'Scopus / DOI Link', 'field_type': 'short_text', 'required': True},
            {'id': 'f4', 'label': 'Author Role', 'field_type': 'dropdown', 'options': ['First Author', 'Corresponding Author', 'Co-Author'], 'required': True},
        ]
    )
    node_c2 = PBASNode.objects.create(
        department=master_dept,
        parent=part_c,
        label='R2. Patents Published & Granted',
        pbas_credit=5,
        limit=10,
        input_mode='upload',
        position=2,
        audience='both',
        form_schema=[
            {'id': 'f1', 'label': 'Patent Application Number', 'field_type': 'short_text', 'required': True},
            {'id': 'f2', 'label': 'Patent Title', 'field_type': 'short_text', 'required': True},
            {'id': 'f3', 'label': 'Status', 'field_type': 'dropdown', 'options': ['Published', 'Granted', 'Commercialized'], 'required': True},
        ]
    )

    # Part D: Institutional Contribution (10 Max)
    part_d = PBASNode.objects.create(
        department=master_dept,
        label='Part D: Institutional Contribution & Administrative Governance (Max 10 Marks)',
        limit=10,
        position=4,
        audience='both',
    )
    node_d1 = PBASNode.objects.create(
        department=master_dept,
        parent=part_d,
        label='D1. Departmental Coordinator (NBA, NAAC, Timetable, Exam Cell)',
        pbas_credit=5,
        limit=5,
        input_mode='upload',
        position=1,
        audience='both',
        form_schema=[
            {'id': 'f1', 'label': 'Portfolio / Responsibility Title', 'field_type': 'short_text', 'required': True},
            {'id': 'f2', 'label': 'Office Order / Appointment Letter Ref', 'field_type': 'short_text', 'required': True},
        ]
    )
    print("✅ Created complete PBAS Node hierarchy (Parts A, B, C, D).")

    # 8. Sample Submissions for Demo & Testing
    PBASSubmission.objects.all().delete()
    faculty_user = created_users['faculty@pbas.edu']
    hod_user = created_users['hod@pbas.edu']
    principal_user = created_users['principal@pbas.edu']

    # Submission 1: Fully Approved Journal Publication
    s1 = PBASSubmission.objects.create(
        node=node_c1,
        user=faculty_user,
        submission_type='form',
        form_data={
            'Article Title': 'Deep Learning for Edge AI in Smart Grid Optimization',
            'Journal Name': 'IEEE Transactions on Smart Grid (Volume 15, Issue 2)',
            'Scopus / DOI Link': 'https://doi.org/10.1109/TSG.2025.10987654',
            'Author Role': 'First Author',
        },
        link='https://doi.org/10.1109/TSG.2025.10987654',
        college=college,
        status='approved',
        current_step='Completed',
        approved_by=principal_user,
        reviewed_at=timezone.now() - timedelta(days=2),
        approval_history=[
            {
                'step': 'Submitted',
                'action': 'submitted',
                'by_name': faculty_user.get_full_name(),
                'timestamp': (timezone.now() - timedelta(days=10)).isoformat(),
                'remarks': 'Evidence submitted',
            },
            {
                'step': 'HOD',
                'action': 'approved',
                'by_name': hod_user.get_full_name(),
                'timestamp': (timezone.now() - timedelta(days=5)).isoformat(),
                'remarks': 'Verified against Scopus database. Verified First Author.',
            },
            {
                'step': 'PRINCIPAL',
                'action': 'approved',
                'by_name': principal_user.get_full_name(),
                'timestamp': (timezone.now() - timedelta(days=2)).isoformat(),
                'remarks': 'Approved 10 credits for Career Advancement Scheme (CAS).',
            },
        ]
    )

    # Submission 2: Pending at HOD Stage
    s2 = PBASSubmission.objects.create(
        node=node_c2,
        user=faculty_user,
        submission_type='form',
        form_data={
            'Patent Application Number': '202541019842 A',
            'Patent Title': 'Automated Smart Drone System for Agricultural Crop Pest Detection',
            'Status': 'Published',
        },
        college=college,
        status='pending',
        current_step='HOD',
        approval_history=[
            {
                'step': 'Submitted',
                'action': 'submitted',
                'by_name': faculty_user.get_full_name(),
                'timestamp': (timezone.now() - timedelta(days=1)).isoformat(),
                'remarks': 'Uploaded Indian Patent Journal publication receipt.',
            }
        ]
    )

    # Submission 3: Pending at Principal Stage
    s3 = PBASSubmission.objects.create(
        node=node_b1,
        user=faculty_user,
        submission_type='form',
        form_data={
            'Competition / Hackathon Title': 'Smart India Hackathon 2025 - Hardware Edition',
            'Award / Prize Won or Finalist Rank': 'First Runner Up (Cash Prize: ₹75,000)',
            'Participating Student Reg Nos': '7376221CS101, 7376221CS108, 7376221CS142',
        },
        college=college,
        status='pending',
        current_step='PRINCIPAL',
        approval_history=[
            {
                'step': 'Submitted',
                'action': 'submitted',
                'by_name': faculty_user.get_full_name(),
                'timestamp': (timezone.now() - timedelta(days=4)).isoformat(),
                'remarks': 'Submitted certificate of accomplishment and mentor citation.',
            },
            {
                'step': 'HOD',
                'action': 'approved',
                'by_name': hod_user.get_full_name(),
                'timestamp': (timezone.now() - timedelta(days=2)).isoformat(),
                'remarks': 'Mentored students secured 2nd place in national finals. Recommended full credits.',
            }
        ]
    )

    # Submission 4: Rejected Submission with Feedback
    s4 = PBASSubmission.objects.create(
        node=node_a2,
        user=faculty_user,
        submission_type='form',
        form_data={
            'Tool / Platform Used (Canvas, Moodle, Google Classroom)': 'Moodle LMS',
            'LMS Course URL': 'https://lms.college.edu/course/view.php?id=302',
        },
        link='https://lms.college.edu/course/view.php?id=302',
        college=college,
        status='rejected',
        current_step='HOD',
        rejection_reason='Course materials not updated for current semester. Please upload latest lecture notes and re-submit.',
        reviewed_at=timezone.now() - timedelta(days=3),
        approval_history=[
            {
                'step': 'Submitted',
                'action': 'submitted',
                'by_name': faculty_user.get_full_name(),
                'timestamp': (timezone.now() - timedelta(days=6)).isoformat(),
                'remarks': 'Submitted LMS link',
            },
            {
                'step': 'HOD',
                'action': 'rejected',
                'by_name': hod_user.get_full_name(),
                'timestamp': (timezone.now() - timedelta(days=3)).isoformat(),
                'remarks': 'Course materials not updated for current semester. Please upload latest lecture notes and re-submit.',
            }
        ]
    )

    print("✅ Created realistic sample PBAS submissions (Approved, Pending at HOD, Pending at Principal, Rejected).")
    print("\n🎉 PBAS Database successfully initialized & seeded!")

if __name__ == '__main__':
    seed()
