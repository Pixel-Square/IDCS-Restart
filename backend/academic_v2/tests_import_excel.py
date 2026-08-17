import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient
from openpyxl import Workbook

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
    AcV2QpPattern,
)


class FacultyExamImportMarksTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='staff1', email='staff1@example.com', password='secret123')
        self.client.force_authenticate(self.user)

        self.department = Department.objects.create(code='CSE', name='Computer Science', short_name='CSE')
        self.program = Program.objects.create(name='B.E.')
        self.semester = Semester.objects.create(number=3)
        self.academic_year = AcademicYear.objects.create(name='2025-2026', is_active=True, parity='ODD')
        self.batch = Batch.objects.create(name='2023-2027', start_year=2023, end_year=2027)
        self.academics_course = AcademicsCourse.objects.create(name='Data Structures', department=self.department, program=self.program)
        self.subject = Subject.objects.create(code='CSE101', name='Data Structures', semester=self.semester, course=self.academics_course)
        self.section = AcademicsSection.objects.create(name='A', batch=self.batch, semester=self.semester)

        self.staff_profile = StaffProfile.objects.create(user=self.user, staff_id='STAFF1', department=self.department)
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
            faculty_user=self.user,
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

        # Pattern enables q1..q3 for the exam
        AcV2QpPattern.objects.create(
            name='CIA1',
            qp_type='CIA',
            class_type=self.class_type,
            pattern={
                'titles': ['Q1', 'Q2', 'Q3'],
                'marks': [10, 15, 20],
                'cos': [1, 2, 3],
                'enabled': [True, True, True],
            },
            is_active=True,
        )

    def _build_test_workbook(self):
        wb = Workbook()
        ws = wb.active
        ws.title = 'Mark Entry'
        headers = ['Sl No', 'Register Number', 'Student Name', 'Q1 (MAX: 10, CO1)', 'Q2 (MAX: 15, CO2)', 'Q3 (MAX: 20, CO3)', 'Total', 'Absent']
        ws.append(headers)
        ws.append(['', '21CS001', 'Student One', 8, 12, 15, '', ''])
        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)
        return bio

    def _build_test_upload(self):
        wb_bytes = self._build_test_workbook().read()
        return SimpleUploadedFile('marks.xlsx', wb_bytes, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    def test_import_marks_with_annotated_question_headers(self):
        response = self.client.post(
            f'/api/academic-v2/exams/{self.exam_assignment.id}/import-marks/',
            {'file': self._build_test_upload()},
            format='multipart',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'preview')
        self.assertEqual(data['matched'], 1)
        self.assertEqual(len(data['students']), 1)
        self.assertEqual(data['students'][0]['roll_number'], '21CS001')
        self.assertEqual(data['students'][0]['mark'], 35)
        self.assertEqual(data['students'][0]['co_marks'], {'q0': 8.0, 'q1': 12.0, 'q2': 15.0})

    def test_apply_import_marks_persists_student_mark(self):
        response = self.client.post(
            f'/api/academic-v2/exams/{self.exam_assignment.id}/import-marks/?apply=true',
            {'file': self._build_test_upload()},
            format='multipart',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'applied')
        self.assertEqual(AcV2StudentMark.objects.filter(exam_assignment=self.exam_assignment, student=self.student_profile).count(), 1)
        sm = AcV2StudentMark.objects.get(exam_assignment=self.exam_assignment, student=self.student_profile)
        self.assertEqual(float(sm.total_mark), 35.0)
        self.assertEqual(sm.question_marks, {'q0': 8.0, 'q1': 12.0, 'q2': 15.0})
