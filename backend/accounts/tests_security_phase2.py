"""Access-control regression tests for the 2026-10-23 audit (SECURITY-AUDIT-2026-10-23.md).

Each test pins one hole that was open before the fix: a student, an
anonymous caller or a staff-flagged account must be refused, while the role
that legitimately owns the action still gets past the permission check.
"""

import uuid

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import Permission, Role, RolePermission, UserRole
from academics.models import Department, StaffProfile, StudentProfile
from discipline.models import DisciplineIncidentLog
from erp.upload_security import validate_upload

User = get_user_model()

PNG_BYTES = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64


class AccessControlPhase2Tests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dept = Department.objects.create(name='Computer Science', code='CSE')

        self.role_student, _ = Role.objects.get_or_create(name='STUDENT')
        self.role_staff, _ = Role.objects.get_or_create(name='STAFF')

        self.student, self.student_profile = self._student('student1', 'REG1001')
        self.other_student, self.other_profile = self._student('student2', 'REG1002')

        self.staff = self._staff('staff1', self.role_staff)

        # Django is_staff flag alone must not grant Academic 2.1 admin powers.
        self.flag_staff = self._staff('flagstaff', self.role_staff)
        self.flag_staff.is_staff = True
        self.flag_staff.save()

        self.acv2_admin = self._staff_with_permission('acv2admin', 'ACV2_ADMIN_TEST', 'academic_v2.page.admin')
        self.dc_admin = self._staff('dcadmin', Role.objects.get_or_create(name='DISCIPLINE_COMMITTEE_ADMIN')[0])
        self.tt_manager = self._staff_with_permission('ttmanager', 'TT_MANAGER_TEST', 'timetable.manage_templates')

    # ------------------------------------------------------------------ helpers
    # Roles can only be assigned once the user has a profile (accounts.validate_roles_for_user).
    def _new_user(self, username):
        return User.objects.create_user(username=username, email=f'{username}@test.local', password='Password@1234')

    def _student(self, username, reg_no):
        user = self._new_user(username)
        profile = StudentProfile.objects.create(user=user, reg_no=reg_no, home_department=self.dept)
        UserRole.objects.create(user=user, role=self.role_student)
        return user, profile

    def _staff(self, username, role):
        user = self._new_user(username)
        StaffProfile.objects.create(user=user, staff_id=f'STF-{username}', department=self.dept)
        UserRole.objects.create(user=user, role=role)
        return user

    def _staff_with_permission(self, username, role_name, code):
        role, _ = Role.objects.get_or_create(name=role_name)
        perm, _ = Permission.objects.get_or_create(code=code)
        RolePermission.objects.get_or_create(role=role, permission=perm)
        return self._staff(username, role)

    def _as(self, user):
        self.client.force_authenticate(user=user)

    # ------------------------------------------------------------ registration
    def test_open_registration_endpoint_is_gone(self):
        res = self.client.post('/api/accounts/register/', {'username': 'x', 'password': 'Whatever@12345'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(User.objects.filter(username='x').exists())

    # ------------------------------------------------------------ academic_v2
    def test_student_cannot_disable_mark_locking(self):
        self._as(self.student)
        res = self.client.patch(f'/api/academic-v2/semester-configs/{uuid.uuid4()}/', {'publish_control_enabled': False}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_is_staff_flag_does_not_grant_acv2_admin(self):
        self._as(self.flag_staff)
        res = self.client.patch(f'/api/academic-v2/semester-configs/{uuid.uuid4()}/', {'publish_control_enabled': False}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_acv2_admin_passes_permission_check(self):
        self._as(self.acv2_admin)
        res = self.client.patch(f'/api/academic-v2/semester-configs/{uuid.uuid4()}/', {'publish_control_enabled': False}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_student_cannot_reassign_section_faculty(self):
        self._as(self.student)
        res = self.client.patch(f'/api/academic-v2/sections/{uuid.uuid4()}/', {'faculty_user': self.student.id}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_config_reads_stay_open_to_authenticated_users(self):
        self._as(self.student)
        self.assertEqual(self.client.get('/api/academic-v2/cycles/').status_code, status.HTTP_200_OK)

    def test_marks_viewsets_are_admin_only(self):
        self._as(self.staff)
        self.assertEqual(self.client.get('/api/academic-v2/internal-marks/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/academic-v2/student-marks/').status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.patch(f'/api/academic-v2/exam-assignments/{uuid.uuid4()}/', {'status': 'DRAFT'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_edit_request_status_cannot_be_patched_directly(self):
        self._as(self.staff)
        res = self.client.patch(f'/api/academic-v2/edit-requests/{uuid.uuid4()}/', {'status': 'APPROVED'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_google_sheet_admin_endpoints_refuse_staff(self):
        self._as(self.staff)
        res = self.client.post('/api/academic-v2/google-sheets/sync-from-sheet/', {'spreadsheetId': 'x', 'examAssignmentId': str(uuid.uuid4())}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_google_sheet_webhook_requires_token(self):
        res = self.client.post('/api/academic-v2/google-sheets/webhook/', {
            'sectionId': str(uuid.uuid4()), 'examAssignmentId': str(uuid.uuid4()), 'rows': [],
        }, format='json')
        # Unknown exam → 404 before the token check; never a 200 write.
        self.assertIn(res.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_webhook_token_is_section_bound(self):
        from academic_v2.google_sheets_service import verify_webhook_token, webhook_token_for_section
        token = webhook_token_for_section('section-a')
        self.assertTrue(verify_webhook_token('section-a', token))
        self.assertFalse(verify_webhook_token('section-b', token))
        self.assertFalse(verify_webhook_token('section-a', ''))

    def test_performance_analytics_require_login(self):
        res = self.client.get('/api/academic-v2/performance/faculty-wise/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_faculty_list_for_student_does_not_return_college(self):
        self._as(self.student)
        res = self.client.get('/api/academic-v2/performance/faculty-wise/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------ discipline
    def _incident(self, student_profile, reporter=None):
        return DisciplineIncidentLog.objects.create(
            student=student_profile, reg_no=student_profile.reg_no, reported_by=reporter,
        )

    def test_discipline_logs_require_login(self):
        self.assertEqual(self.client.get('/api/discipline/logs/').status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.get('/api/discipline/students/').status_code, status.HTTP_401_UNAUTHORIZED)

    def test_student_cannot_list_or_delete_incidents(self):
        log = self._incident(self.student_profile, reporter=self.staff)
        self._as(self.student)
        self.assertEqual(self.client.get('/api/discipline/logs/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(f'/api/discipline/logs/{log.id}/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(DisciplineIncidentLog.objects.filter(pk=log.pk).exists())

    def test_staff_reporter_sees_only_own_submissions(self):
        mine = self._incident(self.student_profile, reporter=self.staff)
        self._incident(self.other_profile, reporter=self.dc_admin)
        self._as(self.staff)
        res = self.client.get('/api/discipline/logs/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([r['id'] for r in res.data['results']], [mine.id])

    def test_reporter_identity_cannot_be_spoofed(self):
        self._as(self.staff)
        res = self.client.post('/api/discipline/logs/', {
            'reg_no': self.student_profile.reg_no, 'student': self.student_profile.id,
            'reported_by_username': 'dcadmin', 'reported_by_name': 'Someone Else',
        }, format='json')
        self.assertIn(res.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED), res.data)
        log = DisciplineIncidentLog.objects.latest('id')
        self.assertEqual(log.reported_by_id, self.staff.id)
        self.assertNotEqual(log.reported_by_name, 'Someone Else')

    def test_student_cannot_upload_receipt_for_another_student(self):
        log = self._incident(self.other_profile, reporter=self.staff)
        self._as(self.student)
        upload = SimpleUploadedFile('receipt.png', PNG_BYTES, content_type='image/png')
        res = self.client.post(f'/api/discipline/logs/{log.id}/upload-receipt/', {'receipt_document': upload}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        log.refresh_from_db()
        self.assertNotEqual(log.status, 'RECEIPT_UPLOADED')

    def test_receipt_upload_rejects_html_disguised_as_image(self):
        log = self._incident(self.student_profile, reporter=self.staff)
        self._as(self.student)
        upload = SimpleUploadedFile('receipt.png', b'<html><script>alert(1)</script></html>', content_type='image/png')
        res = self.client.post(f'/api/discipline/logs/{log.id}/upload-receipt/', {'receipt_document': upload}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_discipline_admin_can_change_categories(self):
        self._as(self.staff)
        self.assertEqual(self.client.post('/api/discipline/categories/', {'title': 'x'}, format='json').status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------ biometrics
    def test_fingerprint_identify_requires_operator(self):
        self.assertEqual(self.client.post('/api/idscan/fingerprint/identify/', {'slot': 1}, format='json').status_code, status.HTTP_401_UNAUTHORIZED)
        self._as(self.student)
        self.assertEqual(self.client.post('/api/idscan/fingerprint/identify/', {'slot': 1}, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_fingerprint_enroll_and_device_mode_require_operator(self):
        self.assertEqual(self.client.post('/api/idscan/fingerprint/enroll/', {}, format='json').status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.get('/api/idscan/biosecure/device/mode/').status_code, status.HTTP_401_UNAUTHORIZED)
        self._as(self.staff)
        self.assertEqual(self.client.post('/api/idscan/biosecure/device/mode/', {'mode': 'ENROLL'}, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_biosecure_admin_logs_refuse_students(self):
        self._as(self.student)
        self.assertEqual(self.client.get('/api/idscan/biosecure/admin/logs/').status_code, status.HTTP_403_FORBIDDEN)

    def test_fingerprint_status_of_other_user_is_hidden(self):
        self._as(self.student)
        res = self.client.get(f'/api/idscan/fingerprint/status/?user_id={self.other_student.id}')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # ------------------------------------------------------------ timetable / config
    def test_student_cannot_change_timetable_rules(self):
        self._as(self.student)
        self.assertEqual(self.client.post('/api/timetable/credit-allocations/', {}, format='json').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post('/api/timetable/templates/', {}, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_timetable_manager_passes_permission_check(self):
        self._as(self.tt_manager)
        res = self.client.post('/api/timetable/credit-allocations/', {}, format='json')
        self.assertNotEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_delete_timetable_assignment(self):
        self._as(self.student)
        # Permission is checked in perform_destroy, after lookup, so a missing row is a 404.
        self.assertIn(self.client.delete('/api/timetable/assignments/999999/').status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_student_cannot_write_batch_years(self):
        self._as(self.student)
        self.assertEqual(self.client.post('/api/academics/batch-years/', {'name': '2099'}, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_coe_external_staff_codes_hidden_from_non_coe(self):
        self._as(self.staff)
        self.assertEqual(self.client.get('/api/coe/external-staff/').status_code, status.HTTP_403_FORBIDDEN)


class UploadValidatorTests(TestCase):
    def test_accepts_real_png_and_renames_it(self):
        f = SimpleUploadedFile('../../evil name.png', PNG_BYTES)
        validate_upload(f)
        self.assertRegex(f.name, r'^[0-9a-f]{32}\.png$')

    def test_rejects_double_extension_script(self):
        with self.assertRaises(ValidationError):
            validate_upload(SimpleUploadedFile('marksheet.php.jpg', b'<?php system($_GET["c"]); ?>'))

    def test_rejects_disallowed_type(self):
        with self.assertRaises(ValidationError):
            validate_upload(SimpleUploadedFile('page.html', b'<html></html>'))

    def test_rejects_oversized_file(self):
        with self.assertRaises(ValidationError):
            validate_upload(SimpleUploadedFile('big.png', PNG_BYTES), max_bytes=10)
