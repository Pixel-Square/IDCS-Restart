from django.db import models
from django.db.models import Q
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone
from datetime import date
from django.utils.translation import gettext_lazy as _
from accounts.models import Role


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


# When an AcademicYear is saved and marked active, update timetable templates
# so a template matching the active year's parity becomes the active template.
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=AcademicYear)
def ensure_timetable_template_matches_academic_year(sender, instance: AcademicYear, **kwargs):
    try:
        # Only take action when this AcademicYear is active and has a parity
        if not instance.is_active or not instance.parity:
            return
        # import here to avoid circular imports at module load
        from timetable.models import TimetableTemplate

        desired = (instance.parity or '').upper()

        # find templates that are compatible: either match parity or BOTH
        compatible_qs = TimetableTemplate.objects.filter(parity__in=[desired, 'BOTH'])

        # If there are no compatible templates, do nothing
        if not compatible_qs.exists():
            return

        # Prefer templates that explicitly match parity over BOTH
        preferred = compatible_qs.filter(parity=desired)
        if preferred.exists():
            to_activate = preferred.first()
        else:
            to_activate = compatible_qs.filter(parity='BOTH').first()

        if not to_activate:
            return

        # Deactivate other templates and activate the chosen one
        TimetableTemplate.objects.exclude(pk=to_activate.pk).update(is_active=False)
        if not to_activate.is_active:
            to_activate.is_active = True
            to_activate.save()
    except Exception:
        # Swallow exceptions to avoid breaking AcademicYear save
        pass


class Department(models.Model):
    code = models.CharField(max_length=16, unique=True)
    name = models.CharField(max_length=128)
    # Short form for display (abbreviation) e.g. 'CSE', 'EEE'
    short_name = models.CharField(max_length=32, blank=True)

    class Meta:
        ordering = ('code',)

    def __str__(self):
        # Prefer short_name for compact displays when provided
        display = self.short_name or self.name
        return f"{self.code} - {display}"


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
    regulation = models.ForeignKey('curriculum.Regulation', on_delete=models.SET_NULL, null=True, blank=True, related_name='batches', help_text='Curriculum regulation this batch follows')

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
    enabled_assessments = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = 'Student Mentor Mapping'
        verbose_name_plural = 'Student Mentor Mappings'
        # No academic year field on this mapping; uniqueness is per student when active
        constraints = [
            models.UniqueConstraint(fields=['student'], condition=Q(is_active=True), name='unique_active_mentor_per_student')
        ]


# Day-level attendance models removed.
# Tables (if present) should be dropped via a Django migration so the DB stays consistent.


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


# Ensure logical `ADVISOR` role is synchronized with SectionAdvisor records.
@receiver(post_save, sender=SectionAdvisor)
def _sync_advisor_role_on_save(sender, instance: SectionAdvisor, created, **kwargs):
    try:
        sp = instance.advisor
        user = getattr(sp, 'user', None)
        if not user:
            return
        role_obj, _ = Role.objects.get_or_create(name='ADVISOR')
        if instance.is_active:
            if role_obj not in user.roles.all():
                user.roles.add(role_obj)
        else:
            # If deactivated, remove ADVISOR only if no other active SectionAdvisor exists
            other_active = SectionAdvisor.objects.filter(advisor=sp, is_active=True).exclude(pk=instance.pk).exists()
            if not other_active:
                try:
                    if role_obj in user.roles.all():
                        user.roles.remove(role_obj)
                except ValidationError:
                    # don't crash on validation; leave role in place
                    pass
    except Exception:
        pass


@receiver(post_delete, sender=SectionAdvisor)
def _sync_advisor_role_on_delete(sender, instance: SectionAdvisor, **kwargs):
    try:
        sp = instance.advisor
        user = getattr(sp, 'user', None)
        if not user:
            return
        role_obj = Role.objects.filter(name='ADVISOR').first()
        if not role_obj:
            return
        other_active = SectionAdvisor.objects.filter(advisor=sp, is_active=True).exists()
        if not other_active:
            try:
                if role_obj in user.roles.all():
                    user.roles.remove(role_obj)
            except ValidationError:
                pass
    except Exception:
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
    elective_subject = models.ForeignKey(
        'curriculum.ElectiveSubject',
        on_delete=models.CASCADE,
        related_name='teaching_assignments_elective',
        null=True,
        blank=True,
    )
    custom_subject = models.CharField(
        max_length=32,
        choices=(
            ('CODE_TANTRA', 'Code Tantra'),
            ('SPORTS', 'Sports'),
            ('YOGA', 'Yoga'),
            ('SPORTS_YOGA', 'SPORTS/YOGA'),
            ('LIBRARY', 'Library'),
            ('INTERNSHIP', 'Internship'),
            ('NPTEL', 'NPTEL'),
            ('SR', 'SR'),
            ('HR', 'HR'),
        ),
        null=True,
        blank=True,
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.CASCADE,
        related_name='teaching_assignments',
        null=True,
        blank=True,
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.PROTECT,
        related_name='teaching_assignments'
    )
    # Per-assignment enabled assessments (faculty override of course-level settings)
    enabled_assessments = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Teaching Assignment'
        verbose_name_plural = 'Teaching Assignments'
        constraints = [
            # Use curriculum_row uniqueness only when curriculum_row is provided
            models.UniqueConstraint(
                fields=['staff', 'curriculum_row', 'section', 'academic_year'],
                condition=Q(curriculum_row__isnull=False),
                name='unique_staff_curriculum_section_year'
            ),
            # Elective uniqueness does not require a section; allow department-wide electives
            models.UniqueConstraint(
                fields=['staff', 'elective_subject', 'academic_year'],
                condition=Q(elective_subject__isnull=False),
                name='unique_staff_elective_year'
            ),
        ]

    def __str__(self):
        # Prefer displaying curriculum row info when available; fall back to Subject
        subj_part = None
        try:
            # Prefer elective_subject first for elective assignments
            if getattr(self, 'elective_subject', None):
                es = self.elective_subject
                subj_part = f"{getattr(es, 'course_code', None) or ''} - {getattr(es, 'course_name', None) or ''}".strip(' -')
            elif getattr(self, 'curriculum_row', None):
                cr = self.curriculum_row
                subj_part = f"{cr.course_code or ''} - {cr.course_name or ''}".strip(' -')
            elif getattr(self, 'subject', None):
                subj_part = getattr(self.subject, 'code', None) or str(self.subject)
            else:
                subj_part = 'No subject'
        except Exception:
            subj_part = getattr(self.subject, 'code', str(self.subject)) if getattr(self, 'subject', None) else 'No subject'

        section_text = str(self.section) if getattr(self, 'section', None) else 'Department-wide'
        return f"{self.staff.staff_id} -> {subj_part} ({section_text} | {self.academic_year})"


class SpecialCourseAssessmentSelection(models.Model):
    """Global enabled assessments for SPECIAL courses.

    One row per curriculum_row + academic_year. Once created, the selection is
    treated as locked for all faculties teaching that special course.
    """

    curriculum_row = models.ForeignKey(
        'curriculum.CurriculumDepartment',
        on_delete=models.CASCADE,
        related_name='special_assessment_selections',
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='special_assessment_selections',
    )
    enabled_assessments = models.JSONField(default=list, blank=True)
    locked = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        StaffProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_special_assessment_selections',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Special Course Assessment Selection'
        verbose_name_plural = 'Special Course Assessment Selections'
        unique_together = (('curriculum_row', 'academic_year'),)

    def __str__(self):
        return f"SpecialAssessments {self.curriculum_row_id} / {self.academic_year_id}"


class SpecialCourseAssessmentEditRequest(models.Model):
    """Faculty request to edit a locked special-course assessment selection.

    IQAC/Admin approves a request; the requester can then edit until expiry.
    """

    STATUS_PENDING = 'PENDING'
    STATUS_APPROVED = 'APPROVED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    )

    selection = models.ForeignKey(
        SpecialCourseAssessmentSelection,
        on_delete=models.CASCADE,
        related_name='edit_requests',
    )
    requested_by = models.ForeignKey(
        StaffProfile,
        on_delete=models.CASCADE,
        related_name='special_assessment_edit_requests',
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    requested_at = models.DateTimeField(auto_now_add=True)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_special_assessment_edit_requests',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    can_edit_until = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Special Course Assessment Edit Request'
        verbose_name_plural = 'Special Course Assessment Edit Requests'
        indexes = [
            models.Index(fields=['status', 'requested_at']),
        ]

    def __str__(self):
        return f"EditRequest {self.selection_id} by {self.requested_by_id} ({self.status})"

    def is_edit_granted(self) -> bool:
        if self.status != self.STATUS_APPROVED:
            return False
        if self.used_at is not None:
            return False
        if self.can_edit_until is None:
            return False
        return timezone.now() < self.can_edit_until


class StudentSubjectBatch(models.Model):
    """A teacher-defined grouping of students for subject-level batching.

    Example: Instructor creates 'Batch 1' containing certain students for
    a subject's internal assessments.
    """
    name = models.CharField(max_length=128)
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='subject_batches')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='subject_batches')
    # Link the batch to a specific curriculum row (subject) so batches are
    # subject-scoped. This is optional but recommended for subject-wise grouping.
    curriculum_row = models.ForeignKey('curriculum.CurriculumDepartment', on_delete=models.CASCADE, null=True, blank=True, related_name='subject_batches')
    students = models.ManyToManyField(StudentProfile, related_name='subject_batches')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Student Subject Batch'
        verbose_name_plural = 'Student Subject Batches'

    def __str__(self):
        return f"{self.name} ({self.staff.staff_id})"


# Attendance models removed. Tables should be dropped via migration.


# Period-wise attendance models (new implementation)
PERIOD_ATTENDANCE_STATUS_CHOICES = (
    ('P', 'Present'),
    ('A', 'Absent'),
    ('OD', 'On Duty'),
    ('LATE', 'Late'),
    ('LEAVE', 'Leave'),
)


class PeriodAttendanceSession(models.Model):
    """Attendance for a specific period (TimetableSlot) on a date for a section.

    - section: which section the attendance is for
    - period: TimetableSlot (period definition)
    - date: date of the session
    - timetable_assignment: optional link to the TimetableAssignment that this session corresponds to
    - created_by: staff who created the session
    - is_locked: once locked, records should not be modified
    - created_at: timestamp
    """
    section = models.ForeignKey('academics.Section', on_delete=models.PROTECT, related_name='period_attendance_sessions')
    period = models.ForeignKey('timetable.TimetableSlot', on_delete=models.PROTECT, related_name='attendance_sessions')
    date = models.DateField(default=timezone.now)
    timetable_assignment = models.ForeignKey('timetable.TimetableAssignment', on_delete=models.SET_NULL, null=True, blank=True, related_name='attendance_sessions')
    created_by = models.ForeignKey('academics.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    is_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Period Attendance Session'
        verbose_name_plural = 'Period Attendance Sessions'
        unique_together = (('section', 'period', 'date', 'timetable_assignment'),)

    def __str__(self):
        return f"PeriodAttendance {self.section} | {self.period} @ {self.date}"



class PeriodAttendanceRecord(models.Model):
    session = models.ForeignKey(PeriodAttendanceSession, on_delete=models.CASCADE, related_name='records')
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='period_attendance_records')
    status = models.CharField(max_length=8, choices=PERIOD_ATTENDANCE_STATUS_CHOICES)
    marked_at = models.DateTimeField(auto_now=True)
    marked_by = models.ForeignKey('academics.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        verbose_name = 'Period Attendance Record'
        verbose_name_plural = 'Period Attendance Records'
        unique_together = (('session', 'student'),)

    def __str__(self):
        return f"{self.student.reg_no} -> {self.get_status_display()} @ {self.session.date}"


class AttendanceUnlockRequest(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected')
    )

    session = models.ForeignKey(PeriodAttendanceSession, on_delete=models.CASCADE, related_name='unlock_requests')
    requested_by = models.ForeignKey('academics.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='attendance_unlock_requests')
    requested_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='PENDING')
    reviewed_by = models.ForeignKey('academics.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='attendance_unlock_reviews')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Attendance Unlock Request'
        verbose_name_plural = 'Attendance Unlock Requests'
        ordering = ('-requested_at',)

    def __str__(self):
        return f"UnlockRequest session={self.session_id} status={self.status} requested_by={getattr(self.requested_by, 'staff_id', None)}"


# Historically the code deleted users when profiles were removed.
# That behavior is unsafe for audit/history. Do NOT delete users when
# profiles are removed; prefer deactivation via accounts.services.deactivate_user.
