from django.test import TestCase
from django.db.models import ProtectedError
from django.contrib.auth import get_user_model
from academics.models import (
    Department,
    Program,
    Batch,
    Semester,
    Section,
    Course,
    StudentProfile,
    StudentSectionAssignment,
    StudentCourseEnrollment,
    PeriodAttendanceSession,
    PeriodAttendanceRecord,
    DailyAttendanceSession,
    DailyAttendanceRecord,
)
from timetable.models import TimetableTemplate, TimetableSlot
from discipline.models import DisciplineCategory, DisciplineIncidentLog
from curriculum.models import Regulation
from datetime import date


class StudentProfileIntegrityProtectionTests(TestCase):
    """
    Step 13: Database Integrity & Migration Alignment
    Validates that on_delete=models.PROTECT prevents accidental cascade
    deletion of StudentProfile when associated with vital academic,
    attendance, or discipline records.
    """

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="student1", password="password123")
        self.dept = Department.objects.create(code="CSE", name="Computer Science Engineering")
        self.program = Program.objects.create(name="B.E.")
        self.regulation = Regulation.objects.create(code="R2023", name="R2023 Regulation")
        self.batch = Batch.objects.create(
            name="2026 Batch",
            regulation=self.regulation,
            start_year=2026,
            end_year=2030,
            department=self.dept,
        )
        self.semester, _ = Semester.objects.get_or_create(number=1)
        self.section = Section.objects.create(
            name="A",
            managing_department=self.dept,
            batch=self.batch,
            semester=self.semester,
        )
        self.course = Course.objects.create(
            name="Computer Science Engineering",
            department=self.dept,
            program=self.program,
        )
        # Note: Do not assign section during creation to avoid auto-triggering
        # _sync_section_assignment_on_profile_save signal in isolated tests.
        self.student = StudentProfile.objects.create(
            user=self.user,
            reg_no="2026CSE001",
        )

        self.tt_template = TimetableTemplate.objects.create(name="Default Template")
        self.tt_slot = TimetableSlot.objects.create(template=self.tt_template, index=1)

    def test_student_deletion_protected_by_section_assignment(self):
        StudentSectionAssignment.objects.create(
            student=self.student,
            section=self.section,
            start_date=date.today(),
        )
        with self.assertRaises(ProtectedError):
            self.student.delete()

    def test_student_deletion_protected_by_course_enrollment(self):
        StudentCourseEnrollment.objects.create(
            student=self.student,
            course=self.course,
        )
        with self.assertRaises(ProtectedError):
            self.student.delete()

    def test_student_deletion_protected_by_period_attendance(self):
        session = PeriodAttendanceSession.objects.create(
            section=self.section,
            period=self.tt_slot,
            date=date.today(),
        )
        PeriodAttendanceRecord.objects.create(
            session=session,
            student=self.student,
            status="P",
        )
        with self.assertRaises(ProtectedError):
            self.student.delete()

    def test_student_deletion_protected_by_daily_attendance(self):
        session = DailyAttendanceSession.objects.create(
            section=self.section,
            date=date.today(),
        )
        DailyAttendanceRecord.objects.create(
            session=session,
            student=self.student,
            status="P",
        )
        with self.assertRaises(ProtectedError):
            self.student.delete()

    def test_student_deletion_protected_by_discipline_incident(self):
        cat = DisciplineCategory.objects.create(title="Dress Code")
        DisciplineIncidentLog.objects.create(
            student=self.student,
            category=cat,
            remarks="Uniform mismatch",
            reg_no=self.student.reg_no,
        )
        with self.assertRaises(ProtectedError):
            self.student.delete()

    def test_student_deletion_succeeds_when_clean(self):
        student_id = self.student.id
        self.student.delete()
        self.assertFalse(StudentProfile.objects.filter(id=student_id).exists())
