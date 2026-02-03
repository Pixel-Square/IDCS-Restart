from django.db import models
from django.db.models import Q
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone
from datetime import date
from django.utils.translation import gettext_lazy as _


class AcademicYear(models.Model):
    name = models.CharField(max_length=32)
    is_active = models.BooleanField(default=False)
    PARITY_CHOICES = (
        ('ODD', 'Odd'),
        ('EVEN', 'Even'),
    )
    parity = models.CharField(max_length=4, choices=PARITY_CHOICES, null=True, blank=True)

    class Meta:
        verbose_name = 'Academic Year'
        verbose_name_plural = 'Academic Years'
        unique_together = ('name', 'parity')

    def __str__(self):
        return f"{self.name}{' (' + self.parity + ')' if self.parity else ''}"


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
    # Semesters are numbered terms common across courses/departments (Sem 1..N).
    number = models.PositiveSmallIntegerField()

    class Meta:
        unique_together = (('number',),)

    def __str__(self):
        return f"Sem {self.number}"


class Section(models.Model):
    # Sections are now batch-wise rather than semester-wise. A Batch groups students
    # (cohort) for a course; sections belong to a Batch.
    name = models.CharField(max_length=8)
    batch = models.ForeignKey('Batch', on_delete=models.CASCADE, related_name='sections')
    semester = models.ForeignKey('Semester', on_delete=models.PROTECT, null=True, blank=True, related_name='sections')

    class Meta:
        unique_together = ('name', 'batch')

    def __str__(self):
        return f"{self.batch} / {self.name}"

    def save(self, *args, **kwargs):
        """Auto-assign `semester` based on the section's batch start year and the
        currently active AcademicYear parity.

        Formula:
          sem_number = (academic_start_year - batch_start_year) * 2 + (1 if parity=='ODD' else 2)

        If `batch.start_year` is not set, try to parse an integer from batch.name.
        """
        # only attempt if semester is not explicitly set
        if not self.semester:
            try:
                batch = getattr(self, 'batch', None)
                if batch is None:
                    return super().save(*args, **kwargs)

                # determine batch start year
                start_year = getattr(batch, 'start_year', None)
                if start_year is None:
                    try:
                        start_year = int(str(batch.name).split('-')[0])
                    except Exception:
                        start_year = None

                if start_year is None:
                    return super().save(*args, **kwargs)

                # find active academic year (fallback to latest)
                ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()
                if ay is None:
                    return super().save(*args, **kwargs)

                # parse academic start year from name like '2025-2026'
                try:
                    acad_start = int(str(ay.name).split('-')[0])
                except Exception:
                    return super().save(*args, **kwargs)

                delta = acad_start - int(start_year)
                # parity determines odd/even semester within the academic year
                offset = 1 if (ay.parity or '').upper() == 'ODD' else 2
                sem_number = delta * 2 + offset
                if sem_number and sem_number > 0:
                    sem_obj, _ = Semester.objects.get_or_create(number=sem_number)
                    self.semester = sem_obj
            except Exception:
                # fail silently and continue saving without semester
                pass

        return super().save(*args, **kwargs)


class Batch(models.Model):
    """A student cohort/batch for a given course.

    Example: Batch name '2023' for B.Tech CSE course. Sections belong to a Batch.
    """
    name = models.CharField(max_length=32)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='batches')
    start_year = models.PositiveSmallIntegerField(null=True, blank=True)
    end_year = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ('name', 'course')

    def __str__(self):
        return f"{self.course.name} - {self.name}"


class Subject(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=128)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name='subjects')
    # Subjects are defined for a specific course and semester. Add explicit
    # course FK so semester is a global term and course is directly available.
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='subjects', null=True, blank=True)

    class Meta:
        unique_together = ('code', 'course')

    def __str__(self):
        return f"{self.code} - {self.name}"


PROFILE_STATUS_CHOICES = (
    ('ACTIVE', 'Active'),
    ('INACTIVE', 'Inactive'),
    ('ALUMNI', 'Alumni'),
    ('RESIGNED', 'Resigned'),
)


class StudentProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='student_profile'
    )
    reg_no = models.CharField(max_length=64, unique=True, db_index=True)
    section = models.ForeignKey(Section, on_delete=models.SET_NULL, null=True, blank=True, related_name='students')
    batch = models.CharField(max_length=32, blank=True)
    status = models.CharField(max_length=16, choices=PROFILE_STATUS_CHOICES, default='ACTIVE')

    def __str__(self):
        return f"Student {self.reg_no} ({self.user.username})"

    def get_current_section_assignment(self):
        """Return the active StudentSectionAssignment or None."""
        try:
            return self.section_assignments.filter(end_date__isnull=True).select_related('section').order_by('-start_date').first()
        except Exception:
            return None

    def get_current_section(self):
        """Return the current Section (via assignment) or fallback to legacy `section` field."""
        a = self.get_current_section_assignment()
        if a and getattr(a, 'section', None):
            return a.section
        return self.section

    current_section = property(get_current_section)

    def clean(self):
        # Prevent user having both student and staff profiles
        try:
            other = getattr(self.user, 'staff_profile', None)
        except Exception:
            other = None
        if other is not None:
            raise ValidationError('User already has a staff profile; cannot create a student profile.')
        # Student-specific status rules
        if hasattr(self, 'status') and self.status == 'RESIGNED':
            raise ValidationError({'status': 'Student cannot have status RESIGNED.'})

    def save(self, *args, **kwargs):
        # Immutable reg_no after creation
        if self.pk:
            try:
                old = StudentProfile.objects.get(pk=self.pk)
            except StudentProfile.DoesNotExist:
                old = None
            if old and old.reg_no != self.reg_no:
                raise ValidationError('Student reg_no is immutable and cannot be changed.')

        # run full clean to enforce validations
        self.full_clean()
        super().save(*args, **kwargs)


class StudentSectionAssignment(models.Model):
    """Time-bound assignment of a student to a section.

    Keeps history of which section a student belonged to during time ranges.
    """
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='section_assignments')
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name='student_assignments')
    start_date = models.DateField(default=date.today)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Student Section Assignment'
        verbose_name_plural = 'Student Section Assignments'
        constraints = [
            models.UniqueConstraint(fields=['student'], condition=Q(end_date__isnull=True), name='unique_active_section_per_student')
        ]

    def clean(self):
        # prevent creating overlapping active assignments
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValidationError({'end_date': _('end_date cannot be before start_date')})

    def save(self, *args, **kwargs):
        # if creating a new active assignment (end_date is None), end any existing active assignment
        if self.pk is None and self.end_date is None:
            qs = StudentSectionAssignment.objects.filter(student=self.student, end_date__isnull=True)
            for a in qs:
                a.end_date = self.start_date
                a.save(update_fields=['end_date'])
        super().save(*args, **kwargs)




class StaffProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_profile'
    )
    staff_id = models.CharField(max_length=64, unique=True, db_index=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    designation = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=16, choices=PROFILE_STATUS_CHOICES, default='ACTIVE')

    def __str__(self):
        return f"Staff {self.staff_id} ({self.user.username})"

    def get_current_department_assignment(self):
        """Return the active StaffDepartmentAssignment or None."""
        try:
            return self.department_assignments.filter(end_date__isnull=True).select_related('department').order_by('-start_date').first()
        except Exception:
            return None

    def get_current_department(self):
        """Return the current Department (via assignment) or fallback to legacy `department` field."""
        a = self.get_current_department_assignment()
        if a and getattr(a, 'department', None):
            return a.department
        return self.department

    current_department = property(get_current_department)

    def clean(self):
        # Prevent user having both staff and student profiles
        try:
            other = getattr(self.user, 'student_profile', None)
        except Exception:
            other = None
        if other is not None:
            raise ValidationError('User already has a student profile; cannot create a staff profile.')
        # Staff-specific status rules
        if hasattr(self, 'status') and self.status == 'ALUMNI':
            raise ValidationError({'status': 'Staff cannot have status ALUMNI.'})

    def save(self, *args, **kwargs):
        # Immutable staff_id after creation
        if self.pk:
            try:
                old = StaffProfile.objects.get(pk=self.pk)
            except StaffProfile.DoesNotExist:
                old = None
            if old and old.staff_id != self.staff_id:
                raise ValidationError('Staff staff_id is immutable and cannot be changed.')

        # run full clean to enforce validations
        self.full_clean()
        super().save(*args, **kwargs)


class StaffDepartmentAssignment(models.Model):
    """Time-bound assignment of a staff member to a department.

    Historical record of staff department affiliations.
    """
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='department_assignments')
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name='staff_assignments')
    start_date = models.DateField(default=date.today)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Staff Department Assignment'
        verbose_name_plural = 'Staff Department Assignments'
        constraints = [
            models.UniqueConstraint(fields=['staff'], condition=Q(end_date__isnull=True), name='unique_active_dept_per_staff')
        ]

    def clean(self):
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValidationError({'end_date': _('end_date cannot be before start_date')})

    def save(self, *args, **kwargs):
        if self.pk is None and self.end_date is None:
            qs = StaffDepartmentAssignment.objects.filter(staff=self.staff, end_date__isnull=True)
            for a in qs:
                a.end_date = self.start_date
                a.save(update_fields=['end_date'])
        super().save(*args, **kwargs)


class RoleAssignment(models.Model):
    """Term-based authority role assignment (e.g., HOD, ADVISOR) to a staff profile.

    This augments the logical `Role` membership which remains static; RoleAssignment
    represents time-bound authority.
    """
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='role_assignments')
    role_name = models.CharField(max_length=64)
    start_date = models.DateField(default=date.today)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Role Assignment'
        verbose_name_plural = 'Role Assignments'
        constraints = [
            models.UniqueConstraint(fields=['staff', 'role_name'], condition=Q(end_date__isnull=True), name='unique_active_role_per_staff')
        ]

    def clean(self):
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValidationError({'end_date': _('end_date cannot be before start_date')})

    def save(self, *args, **kwargs):
        if self.pk is None and self.end_date is None:
            qs = RoleAssignment.objects.filter(staff=self.staff, role_name__iexact=self.role_name, end_date__isnull=True)
            for a in qs:
                a.end_date = self.start_date
                a.save(update_fields=['end_date'])
        super().save(*args, **kwargs)


class StudentMentorMap(models.Model):
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='mentor_mappings')
    mentor = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='mentee_mappings')
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Student Mentor Mapping'
        verbose_name_plural = 'Student Mentor Mappings'
        # No academic year field on this mapping; uniqueness is per student when active
        constraints = [
            models.UniqueConstraint(fields=['student'], condition=Q(is_active=True), name='unique_active_mentor_per_student')
        ]


# Day-level attendance models (fresh implementation)
ATTENDANCE_STATUS_CHOICES = (
    ('P', 'Present'),
    ('A', 'Absent'),
    ('OD', 'On Duty'),
    ('LATE', 'Late'),
    ('LEAVE', 'Leave'),
)


class DayAttendanceSession(models.Model):
    """A single-day attendance session for a Section.

    Fields:
    - section: which section the attendance is for
    - date: attendance date
    - created_by: staff who created/marked the session (usually advisor)
    - is_locked: once locked, records should not be modified
    - created_at: timestamp
    """
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name='day_attendance_sessions')
    date = models.DateField(default=date.today)
    created_by = models.ForeignKey(StaffProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    is_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (('section', 'date'),)

    def __str__(self):
        return f"Attendance {self.section} @ {self.date}"


class DayAttendanceRecord(models.Model):
    session = models.ForeignKey(DayAttendanceSession, on_delete=models.CASCADE, related_name='records')
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='day_attendance_records')
    status = models.CharField(max_length=8, choices=ATTENDANCE_STATUS_CHOICES)
    marked_at = models.DateTimeField(auto_now=True)
    marked_by = models.ForeignKey(StaffProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        unique_together = (('session', 'student'),)

    def __str__(self):
        return f"{self.student} - {self.get_status_display()} @ {self.session.date}"

    def __str__(self):
        return f"{self.student.reg_no} -> {self.mentor.staff_id}"

    def clean(self):
        # minimal validation: mentor must belong to same department as student's course department
        student_dept = None
        # Section is now batch-wise; access course via section.batch
        if self.student and self.student.section and getattr(self.student.section, 'batch', None) and getattr(self.student.section.batch, 'course', None):
            student_dept = self.student.section.batch.course.department

        mentor_dept = getattr(self.mentor, 'department', None)
        if student_dept and mentor_dept and student_dept != mentor_dept:
            from django.core.exceptions import ValidationError
            raise ValidationError('Mentor must belong to the same department as the student')


class SectionAdvisor(models.Model):
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='advisor_mappings')
    advisor = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='section_advisories')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='section_advisors')
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Section Advisor'
        verbose_name_plural = 'Section Advisors'
        constraints = [
            models.UniqueConstraint(fields=['section', 'academic_year'], condition=Q(is_active=True), name='unique_active_advisor_per_section_year')
        ]

    def __str__(self):
        return f"{self.section} -> {self.advisor.staff_id} ({self.academic_year.name})"

    def clean(self):
        # Department membership is not enforced at the model level; allow
        # advisors to be assigned across departments. Permission checks
        # remain the responsibility of higher-level logic (views/permissions).
        pass


class DepartmentRole(models.Model):
    class DeptRole(models.TextChoices):
        HOD = 'HOD', 'Head of Department'
        AHOD = 'AHOD', 'Assistant HOD'

    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='department_roles')
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='department_roles')
    role = models.CharField(max_length=10, choices=DeptRole.choices)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='department_roles')
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Department Role'
        verbose_name_plural = 'Department Roles'
        constraints = [
            # Only one active HOD per department per academic year
            models.UniqueConstraint(fields=['department', 'academic_year'], condition=Q(role='HOD', is_active=True), name='unique_active_hod_per_dept_year')
        ]

    def __str__(self):
        return f"{self.department.code} - {self.get_role_display()} ({self.staff.staff_id} | {self.academic_year.name})"

    def clean(self):
        # Department membership is not enforced at the model level for
        # DepartmentRole. A staff may be assigned roles for departments
        # independent of their profile.department; permission checks
        # should be handled at the views/permissions layer.
        pass


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
        related_name='teaching_assignments',
        null=True,
        blank=True,
    )
    # Prefer referencing the department curriculum row directly rather than creating
    # ad-hoc Subject records. New assignments should use `curriculum_row`.
    curriculum_row = models.ForeignKey(
        'curriculum.CurriculumDepartment',
        on_delete=models.CASCADE,
        related_name='teaching_assignments',
        null=True,
        blank=True,
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
            # Use curriculum_row uniqueness going forward. Keep subject nullable
            # for backward compatibility.
            models.UniqueConstraint(
                fields=['staff', 'curriculum_row', 'section', 'academic_year'],
                name='unique_staff_curriculum_section_year'
            )
        ]

    def __str__(self):
        # Prefer displaying curriculum row info when available; fall back to Subject
        subj_part = None
        try:
            if getattr(self, 'curriculum_row', None):
                cr = self.curriculum_row
                subj_part = f"{cr.course_code or ''} - {cr.course_name or ''}".strip(' -')
            elif getattr(self, 'subject', None):
                # subject may be nullable; guard against None
                subj_part = getattr(self.subject, 'code', None) or str(self.subject)
            else:
                subj_part = 'No subject'
        except Exception:
            subj_part = getattr(self.subject, 'code', str(self.subject)) if getattr(self, 'subject', None) else 'No subject'

        return f"{self.staff.staff_id} -> {subj_part} ({self.section} | {self.academic_year})"


# Attendance models removed. Tables should be dropped via migration.


# Historically the code deleted users when profiles were removed.
# That behavior is unsafe for audit/history. Do NOT delete users when
# profiles are removed; prefer deactivation via accounts.services.deactivate_user.
