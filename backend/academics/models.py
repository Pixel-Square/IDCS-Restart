from django.db import models
from django.conf import settings


class AcademicYear(models.Model):
    name = models.CharField(max_length=32, unique=True)
    is_active = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Academic Year'
        verbose_name_plural = 'Academic Years'

    def __str__(self):
        return self.name


class Department(models.Model):
    code = models.CharField(max_length=16, unique=True)
    name = models.CharField(max_length=128)

    class Meta:
        ordering = ('code',)

    def __str__(self):
        return f"{self.code} - {self.name}"


class Program(models.Model):
    name = models.CharField(max_length=32, unique=True)

    def __str__(self):
        return self.name


class Course(models.Model):
    name = models.CharField(max_length=128)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='courses')
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='courses')

    class Meta:
        unique_together = ('name', 'department', 'program')

    def __str__(self):
        return self.name


class Semester(models.Model):
    number = models.PositiveSmallIntegerField()
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='semesters')

    class Meta:
        unique_together = ('number', 'course')

    def __str__(self):
        return f"{self.course.name} - Sem {self.number}"


class Section(models.Model):
    name = models.CharField(max_length=8)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name='sections')

    class Meta:
        unique_together = ('name', 'semester')

    def __str__(self):
        return f"{self.semester} / {self.name}"


class Subject(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=128)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name='subjects')

    def __str__(self):
        return f"{self.code} - {self.name}"


class StudentProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='student_profile'
    )
    reg_no = models.CharField(max_length=64, unique=True, db_index=True)
    section = models.ForeignKey(Section, on_delete=models.SET_NULL, null=True, blank=True, related_name='students')
    batch = models.CharField(max_length=32, blank=True)

    def __str__(self):
        return f"Student {self.reg_no} ({self.user.username})"


class StaffProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_profile'
    )
    staff_id = models.CharField(max_length=64, unique=True, db_index=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    designation = models.CharField(max_length=128, blank=True)

    def __str__(self):
        return f"Staff {self.staff_id} ({self.user.username})"


class TeachingAssignment(models.Model):
    """Assign a staff member to teach a subject for a section in an academic year.

    Ensures a staff–subject–section–academic_year tuple is unique.
    """
    staff = models.ForeignKey(
        StaffProfile,
        on_delete=models.CASCADE,
        related_name='teaching_assignments'
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name='teaching_assignments'
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.CASCADE,
        related_name='teaching_assignments'
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.PROTECT,
        related_name='teaching_assignments'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Teaching Assignment'
        verbose_name_plural = 'Teaching Assignments'
        constraints = [
            models.UniqueConstraint(
                fields=['staff', 'subject', 'section', 'academic_year'],
                name='unique_staff_subject_section_year'
            )
        ]

    def __str__(self):
        return f"{self.staff.staff_id} -> {self.subject.code} ({self.section} | {self.academic_year})"


# Attendance models
class AttendanceSession(models.Model):
    """A session when attendance is taken for a teaching assignment.

    `period` is optional and can be used for multi-period days.
    """
    teaching_assignment = models.ForeignKey(
        TeachingAssignment,
        on_delete=models.CASCADE,
        related_name='attendance_sessions'
    )
    date = models.DateField()
    period = models.CharField(max_length=32, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_attendance_sessions'
    )
    is_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Attendance Session'
        verbose_name_plural = 'Attendance Sessions'
        constraints = [
            models.UniqueConstraint(
                fields=['teaching_assignment', 'date', 'period'],
                name='unique_teaching_date_period'
            )
        ]

    def __str__(self):
        period_part = f" Period {self.period}" if self.period else ""
        return f"{self.teaching_assignment} — {self.date}{period_part}"


class AttendanceRecord(models.Model):
    PRESENT = 'P'
    ABSENT = 'A'
    STATUS_CHOICES = (
        (PRESENT, 'Present'),
        (ABSENT, 'Absent'),
    )

    attendance_session = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name='records'
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name='attendance_records'
    )
    status = models.CharField(max_length=1, choices=STATUS_CHOICES)
    marked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Attendance Record'
        verbose_name_plural = 'Attendance Records'
        constraints = [
            models.UniqueConstraint(
                fields=['attendance_session', 'student'],
                name='unique_session_student'
            )
        ]

    def __str__(self):
        return f"{self.student.reg_no} — {self.get_status_display()} @ {self.attendance_session}"
