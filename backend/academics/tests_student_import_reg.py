import io
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from academics.models import (
    Batch,
    Department,
    ModeOfTransportation,
    Section,
    StaffProfile,
    StudentProfile,
)
from accounts.models import Permission, Role, RolePermission, UserRole

User = get_user_model()


def build_import_file(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Students Import'
    headers = [
        'student_reg_no', 'name', 'department', 'section', 'email', 'password',
        'batch', 'status', 'core_department', 'M/F', 'deptrollno', 'secrollnum',
        'fathername', 'DOB', 'DD', 'MM', 'YYYY', 'ADD1', 'ADD2', 'ADD3', 'ADDRES4',
        'pincode', 'fathermobile', 'bloodgroup', 'Dept', 'degree', 'MOT',
        'Boardingpoint', 'batch', 'MENTOR',
    ]
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return SimpleUploadedFile(
        'students_import.xlsx',
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


class StudentImportDuplicateRegTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='import-admin',
            email='import-admin@example.com',
            password='admin-pass-123',
        )
        self.sh = Department.objects.create(
            code='S&H',
            name='Science & Humanities',
            short_name='S&H',
            is_sh_main=True,
        )
        self.ai = Department.objects.create(
            code='AI&DS',
            name='Artificial Intelligence & Data Science',
            short_name='AI&DS',
        )
        self.batch = Batch.objects.create(
            name='2026',
            department=self.sh,
            start_year=2026,
            end_year=2030,
        )
        Section.objects.create(name='A', batch=self.batch)

    def _row(self, reg_no, name, dept_roll_no, email):
        return [
            reg_no, name, 'S&H', 'A', email, 'Str0ng#Pass2026', '2026', 'ACTIVE', 'AI&DS',
            'Male', dept_roll_no, 'A2601', 'Parent', '2008-05-15', '15', '5',
            '2008', 'Address', '', '', 'City', '620001', '9876543210', 'O+',
            'AI&DS', 'B.Tech', 'COLLEGE BUS', '', '2026-2030', '',
        ]

    def test_duplicate_reg_numbers_collapse_without_flag(self):
        self.client.force_authenticate(user=self.admin)
        upload = build_import_file([
            self._row('2603811724321000', 'STUDENT ONE', 'ADA26001', 'one@example.com'),
            self._row('2603811724321000', 'STUDENT TWO', 'ADA26002', 'two@example.com'),
        ])
        response = self.client.post(
            '/api/academics/students/import/',
            {'file': upload},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(StudentProfile.objects.filter(reg_no='2603811724321000').count(), 1)
        self.assertEqual(response.data['created'], 1)
        self.assertEqual(response.data['updated'], 1)
        self.assertGreaterEqual(response.data['duplicate_reg_count'], 1)

    def test_use_dept_roll_as_reg_no_creates_every_student(self):
        self.client.force_authenticate(user=self.admin)
        upload = build_import_file([
            self._row('2603811724321000', 'STUDENT ONE', 'ADA26001', 'one@example.com'),
            self._row('2603811724321000', 'STUDENT TWO', 'ADA26002', 'two@example.com'),
        ])
        response = self.client.post(
            '/api/academics/students/import/',
            {'file': upload, 'use_dept_roll_as_reg_no': 'true'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 2)
        self.assertTrue(StudentProfile.objects.filter(reg_no='ADA26001').exists())
        self.assertTrue(StudentProfile.objects.filter(reg_no='ADA26002').exists())
        self.assertTrue(response.data['used_dept_roll_as_reg_no'])

        first = StudentProfile.objects.get(reg_no='ADA26001')
        self.assertEqual(first.section_id, Section.objects.get(batch=self.batch, name='A').id)
        self.assertEqual(first.home_department_id, self.ai.id)
        self.assertEqual(first.batch, '2026')


class StudentImportSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.sh = Department.objects.create(
            code='S&H',
            name='Science & Humanities',
            short_name='S&H',
            is_sh_main=True,
        )
        self.batch = Batch.objects.create(
            name='2026',
            department=self.sh,
            start_year=2026,
            end_year=2030,
        )
        Section.objects.create(name='A', batch=self.batch)

    def _row(self, reg_no, name, email, password='Str0ng#Pass2026', mot='COLLEGE BUS'):
        return [
            reg_no, name, 'S&H', 'A', email, password, '2026', 'ACTIVE', '',
            'Male', 'ADA26001', 'A2601', 'Parent', '2008-05-15', '15', '5',
            '2008', 'Address', '', '', 'City', '620001', '9876543210', 'O+',
            'S&H', 'B.Tech', mot, '', '2026-2030', '',
        ]

    def _admin(self):
        admin = User.objects.create_superuser(
            username='import-admin',
            email='import-admin@example.com',
            password='admin-pass-123',
        )
        self.client.force_authenticate(user=admin)
        return admin

    def _post_csv(self, content):
        upload = SimpleUploadedFile(
            'students.csv',
            content.encode('utf-8'),
            content_type='text/csv',
        )
        return self.client.post(
            '/api/academics/students/import/',
            {'file': upload},
            format='multipart',
        )

    def _staff_user(self, username, with_permission):
        user = User.objects.create_user(
            username=username,
            email=f'{username}@example.com',
            password='StaffPass#2026',
        )
        user.is_staff = True
        user.save(update_fields=['is_staff'])
        StaffProfile.objects.create(user=user, staff_id=username)

        if with_permission:
            role, _ = Role.objects.get_or_create(name='HAA')
            permission, _ = Permission.objects.get_or_create(
                code='students.bulk_import',
                defaults={'description': 'Can bulk import and update student records'},
            )
            RolePermission.objects.get_or_create(role=role, permission=permission)
            UserRole.objects.get_or_create(user=user, role=role)
        return user

    def _post(self, rows):
        upload = build_import_file(rows)
        return self.client.post(
            '/api/academics/students/import/',
            {'file': upload},
            format='multipart',
        )

    def test_staff_without_bulk_import_permission_is_forbidden(self):
        user = self._staff_user('plain-staff', with_permission=False)
        self.client.force_authenticate(user=user)

        response = self._post([self._row('REG1001', 'PLAIN STAFF ROW', 'plain@example.com')])

        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(StudentProfile.objects.filter(reg_no='REG1001').exists())

    def test_staff_with_bulk_import_permission_can_import(self):
        user = self._staff_user('import-staff', with_permission=True)
        self.client.force_authenticate(user=user)

        response = self._post([self._row('REG1002', 'IMPORT STAFF ROW', 'import@example.com')])

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 1)
        self.assertTrue(StudentProfile.objects.filter(reg_no='REG1002').exists())

    def test_weak_password_is_rejected(self):
        admin = User.objects.create_superuser(
            username='weak-pass-admin',
            email='weak-pass-admin@example.com',
            password='admin-pass-123',
        )
        self.client.force_authenticate(user=admin)

        response = self._post([
            self._row('REG1003', 'WEAK PASSWORD', 'weak@example.com', password='12345'),
        ])

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 0)
        self.assertTrue(
            any('password rejected' in error for error in response.data['errors']),
            response.data['errors'],
        )
        self.assertFalse(StudentProfile.objects.filter(reg_no='REG1003').exists())

    def test_email_change_is_not_applied_to_existing_student(self):
        admin = User.objects.create_superuser(
            username='email-admin',
            email='email-admin@example.com',
            password='admin-pass-123',
        )
        self.client.force_authenticate(user=admin)

        created = self._post([
            self._row('REG1004', 'EMAIL STUDENT', 'original@example.com'),
        ])
        self.assertEqual(created.status_code, 200, created.data)
        self.assertEqual(created.data['created'], 1)

        response = self._post([
            self._row('REG1004', 'EMAIL STUDENT', 'attacker@example.com'),
        ])

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['updated'], 1)
        profile = StudentProfile.objects.get(reg_no='REG1004')
        self.assertEqual(profile.user.email, 'original@example.com')
        self.assertTrue(
            any('was not changed' in warning for warning in response.data['warnings']),
            response.data['warnings'],
        )

    def test_csv_import_works(self):
        self._admin()
        content = (
            'student_reg_no,name,department,section,email,password,batch,status\n'
            'REG2001,CSV STUDENT,S&H,A,csv@example.com,Str0ng#Pass2026,2026,ACTIVE\n'
        )

        response = self._post_csv(content)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 1)
        self.assertTrue(StudentProfile.objects.filter(reg_no='REG2001').exists())

    def test_file_size_limit_is_enforced(self):
        self._admin()

        with mock.patch('academics.student_import_views.MAX_IMPORT_FILE_BYTES', 10):
            response = self._post([self._row('REG2002', 'BIG FILE', 'big@example.com')])

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('too large', response.data['error'])
        self.assertFalse(StudentProfile.objects.filter(reg_no='REG2002').exists())

    def test_row_limit_is_enforced(self):
        self._admin()

        with mock.patch('academics.student_import_views.MAX_IMPORT_ROWS', 1):
            response = self._post([
                self._row('REG2003', 'FIRST ROW', 'first@example.com'),
                self._row('REG2004', 'SECOND ROW', 'second@example.com'),
            ])

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('more than 1 data rows', response.data['error'])
        self.assertFalse(StudentProfile.objects.exists())

    def test_invalid_xlsx_content_is_rejected(self):
        self._admin()
        upload = SimpleUploadedFile(
            'students.xlsx',
            b'this is not a zip archive',
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

        response = self.client.post(
            '/api/academics/students/import/',
            {'file': upload},
            format='multipart',
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('valid .xlsx', response.data['error'])

    def test_legacy_xls_is_rejected(self):
        self._admin()
        upload = SimpleUploadedFile(
            'students.xls',
            b'\xd0\xcf\x11\xe0legacy',
            content_type='application/vnd.ms-excel',
        )

        response = self.client.post(
            '/api/academics/students/import/',
            {'file': upload},
            format='multipart',
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Legacy .xls', response.data['error'])

    def test_unknown_transport_mode_is_rejected(self):
        self._admin()

        response = self._post([
            self._row('REG2005', 'CYCLE STUDENT', 'cycle@example.com', mot='Cycle'),
        ])

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 0)
        self.assertTrue(
            any('unrecognised mode of transportation' in error for error in response.data['errors']),
            response.data['errors'],
        )
        self.assertFalse(ModeOfTransportation.objects.filter(name__iexact='Cycle').exists())

    def test_row_failure_is_isolated_and_details_are_not_leaked(self):
        self._admin()
        real_create = StudentProfile.objects.create
        calls = {'count': 0}

        def flaky_create(*args, **kwargs):
            calls['count'] += 1
            if calls['count'] == 1:
                raise RuntimeError('SECRET-INTERNAL-DETAIL')
            return real_create(*args, **kwargs)

        with mock.patch.object(StudentProfile.objects, 'create', side_effect=flaky_create):
            response = self._post([
                self._row('REG2006', 'FAILING ROW', 'failing@example.com'),
                self._row('REG2007', 'SURVIVING ROW', 'surviving@example.com'),
            ])

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 1)
        self.assertTrue(StudentProfile.objects.filter(reg_no='REG2007').exists())
        self.assertFalse(StudentProfile.objects.filter(reg_no='REG2006').exists())
        self.assertFalse(User.objects.filter(username='FAILING ROW').exists())
        self.assertTrue(
            any('server error (ref ' in error for error in response.data['errors']),
            response.data['errors'],
        )
        self.assertFalse(
            any('SECRET-INTERNAL-DETAIL' in error for error in response.data['errors']),
            response.data['errors'],
        )
