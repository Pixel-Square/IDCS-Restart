from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from academics.models import Batch, BatchYear, Course, Department, Program, Section

User = get_user_model()


class BatchSetupAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='academic-admin',
            email='academic-admin@example.com',
            password='admin-pass-123',
        )
        self.student_user = User.objects.create_user(
            username='batch-student',
            email='batch-student@example.com',
            password='student-pass-123',
        )
        self.department = Department.objects.create(
            code='AIDS',
            name='Artificial Intelligence and Data Science',
            short_name='AI&DS',
        )

    def test_create_batch_with_sections(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            '/api/academics/batches/',
            {
                'name': '2026-2030',
                'department': self.department.id,
                'sections': ['A', 'B'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['created'])
        batch = Batch.objects.get(name='2026-2030', department=self.department)
        self.assertEqual(batch.start_year, 2026)
        self.assertEqual(batch.end_year, 2030)
        self.assertEqual(set(batch.sections.values_list('name', flat=True)), {'A', 'B'})
        self.assertTrue(BatchYear.objects.filter(name='2026-2030').exists())

    def test_create_is_idempotent_and_adds_missing_sections(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            'name': '2026-2030',
            'department': self.department.id,
            'sections': ['A'],
        }
        first = self.client.post('/api/academics/batches/', payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)

        second = self.client.post(
            '/api/academics/batches/',
            {**payload, 'sections': ['A', 'B']},
            format='json',
        )
        self.assertEqual(second.status_code, 200, second.data)
        self.assertFalse(second.data['created'])
        batch = Batch.objects.get(name='2026-2030', department=self.department)
        self.assertEqual(batch.sections.count(), 2)

    def test_student_cannot_create_batch(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.post(
            '/api/academics/batches/',
            {'name': '2026-2030', 'department': self.department.id},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_create_section_for_existing_batch(self):
        batch = Batch.objects.create(name='2026-2030', department=self.department)
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            '/api/academics/sections/create/',
            {'batch': batch.id, 'name': 'c'},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(Section.objects.filter(batch=batch, name='C').exists())

        duplicate = self.client.post(
            '/api/academics/sections/create/',
            {'batch': batch.id, 'name': 'C'},
            format='json',
        )
        self.assertEqual(duplicate.status_code, 200, duplicate.data)
        self.assertFalse(duplicate.data['created'])

    def test_batch_list_includes_new_batch(self):
        Batch.objects.create(name='2026-2030', department=self.department)
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/academics/batches/')
        self.assertEqual(response.status_code, 200)
        names = [row['name'] for row in response.data]
        self.assertIn('2026-2030', names)

    def test_course_based_batch_is_idempotent(self):
        program = Program.objects.create(name='B.Tech')
        course = Course.objects.create(name='AI & DS', department=self.department, program=program)
        self.client.force_authenticate(user=self.admin)
        payload = {'name': '2026-2030', 'course': course.id, 'sections': ['A']}

        first = self.client.post('/api/academics/batches/', payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        second = self.client.post('/api/academics/batches/', payload, format='json')
        self.assertEqual(second.status_code, 200, second.data)
        self.assertFalse(second.data['created'])
        self.assertEqual(Batch.objects.filter(name='2026-2030', course=course).count(), 1)

