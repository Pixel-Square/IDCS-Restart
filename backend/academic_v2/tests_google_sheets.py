import os
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from academics.models import (
    AcademicYear,
    Batch,
    Course as AcademicsCourse,
    Department,
    Program,
    Semester,
    Section as AcademicsSection,
    StaffProfile,
    StudentProfile,
    Subject,
    TeachingAssignment,
)
from academic_v2.models import (
    AcV2ClassType,
    AcV2Course,
    AcV2ExamAssignment,
    AcV2Section,
    AcV2StudentMark,
)


class MockResponse:
    def __init__(self, ok, payload=None, text='', status_code=None):
        self.ok = ok
        self._payload = payload or {}
        self.text = text
        self.status_code = status_code or (200 if ok else 400)

    def json(self):
        return self._payload


class GoogleSheetsLinksEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='admin1', email='admin1@example.com', password='secret123')
        self.client.force_authenticate(self.user)

        self.department = Department.objects.create(code='CSE', name='Computer Science', short_name='CSE')
        self.program = Program.objects.create(name='B.E.')
        self.semester = Semester.objects.create(number=3)
        self.academic_year = AcademicYear.objects.create(name='2025-2026', is_active=True, parity='ODD')
        self.batch = Batch.objects.create(name='2023-2027', start_year=2023, end_year=2027)
        self.academics_course = AcademicsCourse.objects.create(name='Data Structures', department=self.department, program=self.program)
        self.subject = Subject.objects.create(code='CSE101', name='Data Structures', semester=self.semester, course=self.academics_course)
        self.section = AcademicsSection.objects.create(name='A', batch=self.batch, semester=self.semester)

        self.staff_user = get_user_model().objects.create_user(username='staff1', email='staff1@example.com', password='secret123')
        self.staff_profile = StaffProfile.objects.create(user=self.staff_user, staff_id='STAFF1', department=self.department)
        self.teaching_assignment = TeachingAssignment.objects.create(
            staff=self.staff_profile,
            subject=self.subject,
            section=self.section,
            academic_year=self.academic_year,
        )

        self.class_type = AcV2ClassType.objects.create(name='THEORY')
        self.acv2_course = AcV2Course.objects.create(
            subject=self.subject,
            semester=self.semester,
            subject_code='CSE101',
            subject_name='Data Structures',
            class_type=self.class_type,
        )
        self.acv2_section = AcV2Section.objects.create(
            course=self.acv2_course,
            teaching_assignment=self.teaching_assignment,
            section_name='A',
            faculty_user=self.staff_user,
        )
        self.exam_assignment = AcV2ExamAssignment.objects.create(
            section=self.acv2_section,
            exam='CIA1',
            exam_display_name='CIA1',
            qp_type='CIA',
            max_marks=50,
        )

        self.student_user = get_user_model().objects.create_user(username='student1', email='student1@example.com', password='secret123')
        self.student_profile = StudentProfile.objects.create(
            user=self.student_user,
            reg_no='21CS001',
            section=self.section,
            batch='2023-2027',
            home_department=self.department,
        )
        AcV2StudentMark.objects.create(
            exam_assignment=self.exam_assignment,
            student=self.student_profile,
            reg_no='21CS001',
            student_name='Arun Kumar',
            total_mark=18,
        )

    def test_google_sheets_links_endpoint_returns_backend_sections(self):
        response = self.client.get('/api/academic-v2/google-sheets/links/')

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['courseCode'], 'CSE101')
        self.assertEqual(data[0]['courseName'], 'Data Structures')
        self.assertEqual(data[0]['section'], 'A')
        self.assertEqual(data[0]['assignments'], ['CIA1'])
        self.assertEqual(data[0]['students'][0]['registerNo'], '21CS001')

    @patch('academic_v2.views._get_google_oauth_client_config')
    def test_google_sheets_oauth_start_returns_auth_url(self, mock_client_config):
        mock_client_config.return_value = {
            'web': {
                'client_id': 'client-id',
                'client_secret': 'client-secret',
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        }

        with patch('academic_v2.views.InstalledAppFlow.from_client_config') as mock_flow:
            mock_flow.return_value.authorization_url.return_value = ('https://accounts.google.com/o/oauth2/auth?state=abc', 'abc')

            response = self.client.get('/api/academic-v2/google-sheets/oauth/start/')

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('authUrl', data)
        self.assertIn('accounts.google.com', data['authUrl'])

    @patch('academic_v2.views.create_google_spreadsheet')
    def test_google_sheets_create_endpoint_creates_spreadsheet_for_selected_sections(self, mock_create):
        mock_create.return_value = {
            'spreadsheetId': 'sheet-123',
            'sheetUrl': 'https://docs.google.com/spreadsheets/d/sheet-123/edit',
            'title': 'CSE101 - Data Structures - A',
        }

        response = self.client.post('/api/academic-v2/google-sheets/create/', {
            'section_ids': [str(self.acv2_section.id)],
            'config': {
                'serviceAccountEmail': 'svc@example.com',
                'privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
                'spreadsheetFolderId': 'folder-123',
                'sharingDomain': 'example.com',
            },
        }, format='json')

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['sheetUrl'], 'https://docs.google.com/spreadsheets/d/sheet-123/edit')
        mock_create.assert_called_once()

    @patch('academic_v2.google_sheets_service._get_access_token')
    @patch('academic_v2.google_sheets_service.requests.post')
    def test_create_google_spreadsheet_raises_when_drive_create_fails_quota_text(self, mock_post, mock_get_token):
        mock_get_token.return_value = 'token'

        mock_post.return_value = MockResponse(False, text='The user\'s Drive storage quota has been exceeded.')

        from academic_v2.google_sheets_service import GoogleSheetsServiceError, create_google_spreadsheet

        with self.assertRaises(GoogleSheetsServiceError):
            create_google_spreadsheet(
                title='Test sheet',
                assignments=['CIA1'],
                config={
                    'serviceAccountEmail': 'svc@example.com',
                    'privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
                    'impersonatedUserEmail': 'teacher@example.com',
                },
                folder_id='folder-123',
            )

    @patch('academic_v2.google_sheets_service._get_access_token')
    @patch('academic_v2.google_sheets_service.requests.post')
    def test_create_google_spreadsheet_raises_when_drive_create_fails(self, mock_post, mock_get_token):
        mock_get_token.return_value = 'token'

        mock_post.return_value = MockResponse(False, text='Generic failure')

        from academic_v2.google_sheets_service import GoogleSheetsServiceError, create_google_spreadsheet

        with self.assertRaises(GoogleSheetsServiceError):
            create_google_spreadsheet(
                title='Test sheet',
                assignments=['CIA1'],
                config={
                    'serviceAccountEmail': 'svc@example.com',
                    'privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
                    'impersonatedUserEmail': 'teacher@example.com',
                },
                folder_id='folder-123',
            )

    @patch('academic_v2.google_sheets_service._get_access_token')
    @patch('academic_v2.google_sheets_service.requests.post')
    def test_create_google_spreadsheet_reports_storage_quota_exceeded(self, mock_post, mock_get_token):
        mock_get_token.return_value = 'token'

        mock_post.return_value = MockResponse(False, {
            'error': {
                'code': 403,
                'message': 'The user\'s Drive storage quota has been exceeded.',
                'errors': [
                    {
                        'message': 'The user\'s Drive storage quota has been exceeded.',
                        'domain': 'usageLimits',
                        'reason': 'storageQuotaExceeded',
                    }
                ],
            }
        }, text='The user\'s Drive storage quota has been exceeded.')

        from academic_v2.google_sheets_service import GoogleSheetsServiceError, create_google_spreadsheet

        with self.assertRaises(GoogleSheetsServiceError) as cm:
            create_google_spreadsheet(
                title='Test sheet',
                assignments=['CIA1'],
                config={
                    'serviceAccountEmail': 'svc@example.com',
                    'privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
                    'impersonatedUserEmail': 'teacher@example.com',
                },
                folder_id='folder-123',
            )

        self.assertIn('storage quota', str(cm.exception).lower())

    def test_create_google_spreadsheet_requires_folder_id(self):
        from academic_v2.google_sheets_service import GoogleSheetsServiceError, create_google_spreadsheet

        with self.assertRaises(GoogleSheetsServiceError) as cm:
            create_google_spreadsheet(
                title='Test sheet',
                assignments=['CIA1'],
                config={
                    'serviceAccountEmail': 'svc@example.com',
                    'privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
                },
                folder_id=None,
            )

        self.assertIn('google drive folder id is required', str(cm.exception).lower())

    @patch.dict(os.environ, {
        'GOOGLE_SERVICE_ACCOUNT_EMAIL': 'svc@example.com',
        'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    }, clear=False)
    @patch('academic_v2.google_sheets_service._get_access_token')
    @patch('academic_v2.google_sheets_service.requests.post')
    def test_create_google_spreadsheet_uses_env_service_account_when_config_missing(self, mock_post, mock_get_token):
        mock_get_token.return_value = 'token'

        mock_post.side_effect = [
            MockResponse(True, {'id': 'sheet-123'}),
            MockResponse(True, {}),
            MockResponse(True, {}),
        ]

        from academic_v2.google_sheets_service import create_google_spreadsheet

        create_google_spreadsheet(
            title='CSE101 - Data Structures Marks Entry',
            assignments=['Quiz 1'],
            config={},
            folder_id='folder-123',
        )

        self.assertTrue(mock_get_token.called)

    @patch('academic_v2.google_sheets_service._get_access_token')
    @patch('academic_v2.google_sheets_service.requests.put')
    @patch('academic_v2.google_sheets_service.requests.post')
    def test_create_google_spreadsheet_writes_initial_sheet_values(self, mock_post, mock_put, mock_get_token):
        mock_get_token.return_value = 'token'

        mock_post.side_effect = [
            MockResponse(True, {'id': 'sheet-123'}),
            MockResponse(True, {'replies': [{'addSheet': {'properties': {'sheetId': 1}}}, {'addSheet': {'properties': {'sheetId': 2}}}]}),
            MockResponse(True, {}),
            MockResponse(True, {}),
        ]
        mock_put.return_value = MockResponse(True, {})

        from academic_v2.google_sheets_service import create_google_spreadsheet

        create_google_spreadsheet(
            title='CSE101 - Data Structures Marks Entry',
            assignments=['CIA1'],
            config={
                'serviceAccountEmail': 'svc@example.com',
                'privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
            },
            folder_id='folder-123',
            sheet_data={'CIA1': [['ROLL NO', 'NAME', 'TOTAL'], ['21CS001', 'Arun', 18]]},
        )

        self.assertTrue(mock_put.called)

    @patch('academic_v2.google_sheets_service._get_access_token')
    @patch('academic_v2.google_sheets_service.requests.post')
    def test_create_google_spreadsheet_adds_hidden_config_sheet(self, mock_post, mock_get_token):
        mock_get_token.return_value = 'token'

        mock_post.side_effect = [
            MockResponse(True, {'id': 'sheet-123'}),
            MockResponse(True, {}),
            MockResponse(True, {}),
        ]

        from academic_v2.google_sheets_service import create_google_spreadsheet

        create_google_spreadsheet(
            title='CSE101 - Data Structures Marks Entry',
            assignments=['Quiz 1', 'Assignment 1'],
            config={
                'serviceAccountEmail': 'svc@example.com',
                'privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
            },
            folder_id='folder-123',
            course_code='CSE101',
            webhook_url='https://example.com/api/marks/sync',
        )

        batch_call = next(call for call in mock_post.call_args_list if call.args and '/spreadsheets/' in call.args[0] and ':batchUpdate' in call.args[0])
        requests_payload = batch_call.kwargs['json']['requests']
        sheet_titles = [req['addSheet']['properties']['title'] for req in requests_payload if 'addSheet' in req]
        self.assertIn('Quiz 1', sheet_titles)
        self.assertIn('Assignment 1', sheet_titles)
        self.assertIn('__ERP_CONFIG__', sheet_titles)
