import json
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import Role, UserRole
from academics.models import Department, Program, Course, Batch, Section, AcademicYear, StudentProfile, StaffProfile, SectionAdvisor, StudentMentorMap
from COE.permissions import IsCoeUser

User = get_user_model()


class SecurityPhase1RegressionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create roles
        self.role_student, _ = Role.objects.get_or_create(name='STUDENT')
        self.role_staff, _ = Role.objects.get_or_create(name='STAFF')
        self.role_coe, _ = Role.objects.get_or_create(name='COE')
        self.role_hod, _ = Role.objects.get_or_create(name='HOD')

        # Create Department
        self.dept = Department.objects.create(name='Computer Science', code='CSE')
        self.dept2 = Department.objects.create(name='Mechanical Engineering', code='MECH')

        # Create AcademicYear, Program, Course, Batch, Section
        self.academic_year = AcademicYear.objects.create(name='2025-2026', is_active=True, parity='ODD')
        self.program = Program.objects.create(name='B.E')
        self.course = Course.objects.create(name='Computer Science and Engineering', department=self.dept, program=self.program)
        self.batch = Batch.objects.create(name='2022-2026', department=self.dept, course=self.course, start_year=2022, end_year=2026)
        self.section = Section.objects.create(name='CSE-A', batch=self.batch)

        # Create regular student user & profile
        self.student_user = User.objects.create_user(
            username='student1',
            email='student1@test.local',
            password='Password@1234'
        )
        self.student_profile = StudentProfile.objects.create(
            user=self.student_user,
            reg_no='REG1001',
            section=self.section,
            home_department=self.dept
        )
        UserRole.objects.create(user=self.student_user, role=self.role_student)

        # Create generic staff user (only STAFF role, no advisor/mentor/HOD link)
        self.generic_staff = User.objects.create_user(
            username='generic_staff',
            email='staff@test.local',
            password='Password@1234'
        )
        self.staff_profile = StaffProfile.objects.create(
            user=self.generic_staff,
            staff_id='STF001',
            department=self.dept2
        )
        UserRole.objects.create(user=self.generic_staff, role=self.role_staff)

        # Create COE user
        self.coe_user = User.objects.create_user(
            username='coe_officer',
            email='coe@krct.ac.in',
            password='Password@1234'
        )
        self.coe_staff_profile = StaffProfile.objects.create(
            user=self.coe_user,
            staff_id='COE001',
            department=self.dept
        )
        UserRole.objects.create(user=self.coe_user, role=self.role_coe)

        # Create Superuser
        self.superuser = User.objects.create_superuser(
            username='admin_user',
            email='admin@test.local',
            password='AdminPassword@1234'
        )

    def test_coe_permission_blocks_unauthorized_users(self):
        """Verify IsCoeUser blocks regular staff, students, and unauthenticated users."""
        perm = IsCoeUser()

        # Anonymous user
        class DummyRequestAnon:
            user = None

        req_anon = DummyRequestAnon()
        req_anon.user = type('Anon', (), {'is_authenticated': False, 'is_superuser': False})()
        self.assertFalse(perm.has_permission(req_anon, None))

        # Regular student
        class DummyRequestStudent:
            user = self.student_user

        self.assertFalse(perm.has_permission(DummyRequestStudent(), None))

        # Generic staff member
        class DummyRequestStaff:
            user = self.generic_staff

        self.assertFalse(perm.has_permission(DummyRequestStaff(), None))

        # Authorized COE user
        class DummyRequestCoe:
            user = self.coe_user

        self.assertTrue(perm.has_permission(DummyRequestCoe(), None))

        # Superuser
        class DummyRequestSuperuser:
            user = self.superuser

        self.assertTrue(perm.has_permission(DummyRequestSuperuser(), None))

    def test_student_profile_update_view_blocks_unauthorized_staff(self):
        """Verify generic STAFF cannot access or modify unrelated student profiles (IDOR prevention)."""
        self.client.force_authenticate(user=self.generic_staff)

        # GET request by unauthorized staff should be forbidden (403)
        res_get = self.client.get(f'/api/academics/students/{self.student_profile.pk}/')
        self.assertEqual(res_get.status_code, status.HTTP_403_FORBIDDEN)

        # PATCH request by unauthorized staff should also be forbidden (403)
        res_patch = self.client.patch(
            f'/api/academics/students/{self.student_profile.pk}/',
            {'status': 'INACTIVE'},
            format='json'
        )
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_profile_update_view_allows_self_access(self):
        """Verify student can view their own profile."""
        self.client.force_authenticate(user=self.student_user)
        res = self.client.get(f'/api/academics/students/{self.student_profile.pk}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('reg_no'), 'REG1001')

    def test_student_profile_update_view_allows_assigned_advisor(self):
        """Verify active section advisor can view their assigned section student."""
        advisor_user = User.objects.create_user(
            username='advisor1',
            email='advisor1@test.local',
            password='Password@1234'
        )
        advisor_profile = StaffProfile.objects.create(
            user=advisor_user,
            staff_id='ADV001',
            department=self.dept
        )
        UserRole.objects.create(user=advisor_user, role=Role.objects.get_or_create(name='ADVISOR')[0])
        SectionAdvisor.objects.create(
            section=self.section,
            advisor=advisor_profile,
            academic_year=self.academic_year,
            is_active=True
        )

        self.client.force_authenticate(user=advisor_user)
        res = self.client.get(f'/api/academics/students/{self.student_profile.pk}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_change_password_enforces_complexity_and_length(self):
        """Verify weak passwords (< 8 chars, all numbers, common) are rejected by ChangePasswordView."""
        self.client.force_authenticate(user=self.student_user)

        # 1. Too short (< 8 chars)
        res_short = self.client.post('/api/accounts/change-password/', {
            'current_password': 'Password@1234',
            'new_password': 'short',
            'confirm_password': 'short',
        })
        self.assertEqual(res_short.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Entirely numeric
        res_numeric = self.client.post('/api/accounts/change-password/', {
            'current_password': 'Password@1234',
            'new_password': '1234567890',
            'confirm_password': '1234567890',
        })
        self.assertEqual(res_numeric.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Same as current password
        res_same = self.client.post('/api/accounts/change-password/', {
            'current_password': 'Password@1234',
            'new_password': 'Password@1234',
            'confirm_password': 'Password@1234',
        })
        self.assertEqual(res_same.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Valid strong password
        res_valid = self.client.post('/api/accounts/change-password/', {
            'current_password': 'Password@1234',
            'new_password': 'StrongNewPassword@2026!',
            'confirm_password': 'StrongNewPassword@2026!',
        })
        self.assertEqual(res_valid.status_code, status.HTTP_200_OK)
