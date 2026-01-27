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

class RegulationYear(models.Model):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = 'Regulation Year'
        verbose_name_plural = 'Regulation Years'

    def __str__(self):
        return self.name


class Curriculum(models.Model):
    CATEGORY_CORE = 'CORE'
    CATEGORY_PE = 'PE'
    CATEGORY_OE = 'OE'
    CATEGORY_EM = 'EM'

    CATEGORY_CHOICES = (
        (CATEGORY_CORE, 'CORE'),
        (CATEGORY_PE, 'PE'),
        (CATEGORY_OE, 'OE'),
        (CATEGORY_EM, 'EM'),
    )

    CLASS_THEORY = 'THEORY'
    CLASS_PRACTICAL = 'PRACTICAL'
    CLASS_TCPL = 'TCPL'
    CLASS_PMBL = 'PMBL'

    CLASSIFICATION_CHOICES = (
        (CLASS_THEORY, 'THEORY'),
        (CLASS_PRACTICAL, 'PRACTICAL'),
        (CLASS_TCPL, 'TCPL'),
        (CLASS_PMBL, 'PMBL'),
    )

    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='curricula')
    regulation_year = models.ForeignKey(RegulationYear, on_delete=models.CASCADE, related_name='curricula')
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name='curricula')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='curricula')

    category = models.CharField(max_length=10, choices=CATEGORY_CHOICES)
    classification = models.CharField(max_length=12, choices=CLASSIFICATION_CHOICES)

    l = models.PositiveSmallIntegerField(default=0)
    t = models.PositiveSmallIntegerField(default=0)
    p = models.PositiveSmallIntegerField(default=0)
    s = models.PositiveSmallIntegerField(default=0)
    c = models.PositiveSmallIntegerField(default=0)

    cia_marks = models.PositiveSmallIntegerField()
    ese_marks = models.PositiveSmallIntegerField()
    total_marks = models.PositiveSmallIntegerField()
    total_hours = models.PositiveSmallIntegerField()
    exam_pattern = models.CharField(max_length=20)

    class Meta:
        verbose_name = 'Curriculum'
        verbose_name_plural = 'Curricula'
        constraints = [
            models.UniqueConstraint(
                fields=['subject', 'semester', 'regulation_year'],
                name='unique_curriculum_subject_semester_regulation'
            )
        ]

    def __str__(self):
        return f"{self.subject} — {self.semester}"


class CurriculumAcademicYearMapping(models.Model):
    regulation_year = models.ForeignKey(
        RegulationYear,
        on_delete=models.CASCADE,
        related_name='academic_year_mappings'
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='regulation_year_mappings'
    )

    class Meta:
        verbose_name = 'Curriculum Academic Year Mapping'
        verbose_name_plural = 'Curriculum Academic Year Mappings'
        constraints = [
            models.UniqueConstraint(
                fields=['regulation_year', 'academic_year'],
                name='unique_regulation_academicyear_mapping'
            )
        ]

    def __str__(self):
        return f"{self.regulation_year} ↔ {self.academic_year}"


class ElectiveOffering(models.Model):
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name='elective_offerings'
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='elective_offerings'
    )
    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name='elective_offerings'
    )
    offering_department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='offered_electives'
    )
    assigned_staff = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_electives'
    )
    max_students = models.PositiveSmallIntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Elective Offering'
        verbose_name_plural = 'Elective Offerings'
        constraints = [
            models.UniqueConstraint(
                fields=['subject', 'academic_year', 'semester'],
                name='unique_elective_subject_year_semester'
            )
        ]

    def __str__(self):
        return f"{self.subject} - {self.academic_year}"


class ElectiveEnrollment(models.Model):
    elective_offering = models.ForeignKey(
        'ElectiveOffering',
        on_delete=models.CASCADE,
        related_name='enrollments'
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name='elective_enrollments'
    )

    class Meta:
        verbose_name = 'Elective Enrollment'
        verbose_name_plural = 'Elective Enrollments'
        constraints = [
            models.UniqueConstraint(
                fields=['elective_offering', 'student'],
                name='unique_elective_offering_student'
            )
        ]

    def __str__(self):
        return f"{self.student} -> {self.elective_offering}"


class ElectiveOfferingBlockedDepartment(models.Model):
    elective_offering = models.ForeignKey(
        'ElectiveOffering',
        on_delete=models.CASCADE,
        related_name='blocked_departments'
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='blocked_elective_offerings'
    )

    class Meta:
        verbose_name = 'Elective Offering Blocked Department'
        verbose_name_plural = 'Elective Offering Blocked Departments'
        constraints = [
            models.UniqueConstraint(
                fields=['elective_offering', 'department'],
                name='unique_electiveoffering_department_block'
            )
        ]


class Batch(models.Model):
    name = models.CharField(max_length=50)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='batches')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='batches')
    section = models.ForeignKey(Section, on_delete=models.SET_NULL, null=True, blank=True, related_name='batches')
    is_elective_batch = models.BooleanField(default=False)
    created_by = models.ForeignKey(StaffProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_batches')

    class Meta:
        verbose_name = 'Batch'
        verbose_name_plural = 'Batches'
        constraints = [
            models.CheckConstraint(
                check=(models.Q(is_elective_batch=False) | models.Q(section__isnull=True)),
                name='batch_elective_section_null'
            )
        ]

    def __str__(self):
        return self.name

class BatchStudent(models.Model):
    batch = models.ForeignKey(
        Batch,
        on_delete=models.CASCADE,
        related_name='students'
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name='batch_memberships'
    )

    class Meta:
        verbose_name = 'Batch Student'
        verbose_name_plural = 'Batch Students'
        constraints = [
            models.UniqueConstraint(
                fields=['batch', 'student'],
                name='unique_batch_student'
            )
        ]

    def __str__(self):
        return f"{self.student} in {self.batch}"


class TimetableStructure(models.Model):
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='timetable_structures'
    )
    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name='timetable_structures'
    )
    working_days = models.PositiveSmallIntegerField()
    max_periods_per_day = models.PositiveSmallIntegerField()
    period_duration_minutes = models.PositiveSmallIntegerField()
    lunch_after_period = models.PositiveSmallIntegerField()

    class Meta:
        verbose_name = 'Timetable Structure'
        verbose_name_plural = 'Timetable Structures'
        constraints = [
            models.UniqueConstraint(
                fields=['academic_year', 'semester'],
                name='unique_timetablestructure_year_semester'
            )
        ]

    def __str__(self):
        return f"{self.academic_year} — {self.semester}"


class ClassTimetable(models.Model):
    section = models.ForeignKey(
        Section,
        on_delete=models.CASCADE,
        related_name='class_timetables'
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='class_timetables'
    )
    day_of_week = models.PositiveSmallIntegerField()
    period_number = models.PositiveSmallIntegerField()
    subject = models.ForeignKey(
        Subject,
        on_delete=models.PROTECT,
        related_name='class_timetables'
    )
    staff = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_timetables'
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_timetables'
    )

    class Meta:
        verbose_name = 'Class Timetable'
        verbose_name_plural = 'Class Timetables'
        constraints = [
            models.UniqueConstraint(
                fields=['section', 'day_of_week', 'period_number'],
                name='unique_section_day_period'
            )
        ]

    def __str__(self):
        return f"{self.section} Day {self.day_of_week} Period {self.period_number}"


class SpecialTimetable(models.Model):
    section = models.ForeignKey(
        Section,
        on_delete=models.CASCADE,
        related_name='special_timetables'
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='special_timetables'
    )
    date = models.DateField()
    created_by = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_special_timetables'
    )
    reason = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = 'Special Timetable'
        verbose_name_plural = 'Special Timetables'

    def __str__(self):
        return f"{self.date} — {self.section}"


class SpecialTimetableEntry(models.Model):
    special_timetable = models.ForeignKey(
        SpecialTimetable,
        on_delete=models.CASCADE,
        related_name='entries'
    )
    period_number = models.PositiveSmallIntegerField()
    subject = models.ForeignKey(
        Subject,
        on_delete=models.PROTECT,
        related_name='special_timetable_entries'
    )
    staff = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='special_timetable_entries'
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='special_timetable_entries'
    )

    class Meta:
        verbose_name = 'Special Timetable Entry'
        verbose_name_plural = 'Special Timetable Entries'
        constraints = [
            models.UniqueConstraint(
                fields=['special_timetable', 'period_number'],
                name='unique_specialtimetable_period'
            )
        ]

    def __str__(self):
        return f"{self.special_timetable.date} Period {self.period_number} ({self.subject})"

