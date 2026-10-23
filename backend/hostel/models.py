"""Data model for the Hostel / Student Facilities ERP module.

The module is intentionally self-contained except for two read-only links into
the existing academic data:

* ``academics.StudentProfile`` – the single source of truth for student master
  data (roll number, name, department, programme, semester, section, ...).
* ``academics.AcademicYear`` – used to scope facility selections, allocations
  and fee records to the running academic year.

Everything else (buildings, floors, rooms, allocations, transport, fees,
complaints, mess, visitors, inventory, notices, clearance) lives here.
"""

import secrets
import string

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


# ---------------------------------------------------------------------------
# Shared choices / helpers
# ---------------------------------------------------------------------------

RESIDENCE_DAY_SCHOLAR = 'DAY_SCHOLAR'
RESIDENCE_HOSTELLER = 'HOSTELLER'
RESIDENCE_CATEGORY_CHOICES = (
    (RESIDENCE_DAY_SCHOLAR, 'Day Scholar'),
    (RESIDENCE_HOSTELLER, 'Hosteller'),
)

FACILITY_STATUS_NOT_SUBMITTED = 'NOT_SUBMITTED'
FACILITY_STATUS_PENDING = 'PENDING'
FACILITY_STATUS_APPROVED = 'APPROVED'
FACILITY_STATUS_REJECTED = 'REJECTED'
FACILITY_STATUS_EXPIRED = 'EXPIRED'
FACILITY_STATUS_CHOICES = (
    (FACILITY_STATUS_NOT_SUBMITTED, 'Not Submitted'),
    (FACILITY_STATUS_PENDING, 'Pending Approval'),
    (FACILITY_STATUS_APPROVED, 'Approved'),
    (FACILITY_STATUS_REJECTED, 'Rejected'),
    (FACILITY_STATUS_EXPIRED, 'Expired'),
)

# Hostel gender category. Rooms inherit the building category when their own
# category is blank. Gender-based allocation is validated in services.py.
HOSTEL_CAT_BOYS = 'BOYS'
HOSTEL_CAT_GIRLS = 'GIRLS'
HOSTEL_CAT_STAFF = 'STAFF'
HOSTEL_CAT_MIXED = 'MIXED'
HOSTEL_CATEGORY_CHOICES = (
    (HOSTEL_CAT_BOYS, 'Boys'),
    (HOSTEL_CAT_GIRLS, 'Girls'),
    (HOSTEL_CAT_STAFF, 'Staff'),
    (HOSTEL_CAT_MIXED, 'Mixed'),
)

ALLOCATION_ACTIVE = 'ACTIVE'


def _random_token(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


class HostelConfiguration(TimeStampedModel):
    """Singleton holding the institution-wide hostel policy switches."""

    allow_student_self_selection = models.BooleanField(
        default=True,
        help_text='Allow students to submit their Hostel / Day Scholar / Bus selection themselves.',
    )
    require_approval_for_selection = models.BooleanField(
        default=False,
        help_text='First-time selections must be approved by an administrator.',
    )
    allow_student_edit_after_selection = models.BooleanField(
        default=False,
        help_text='Allow students to change an already submitted selection directly. '
                  'When disabled, a change request is created instead.',
    )
    require_approval_for_changes = models.BooleanField(
        default=True,
        help_text='Category changes always go through the approval workflow.',
    )
    release_room_on_category_change = models.BooleanField(
        default=False,
        help_text='When a hosteller switches to Day Scholar, release the room automatically. '
                  'Keep this disabled to require an approved vacating / transfer workflow.',
    )
    profile_verification_required = models.BooleanField(
        default=True,
        help_text='Mark selected facilities as pending profile verification until staff confirm them.',
    )
    notes = models.TextField(blank=True, default='')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_configuration_updates',
    )

    class Meta:
        db_table = 'hostel_configuration'
        verbose_name = 'Hostel Configuration'
        verbose_name_plural = 'Hostel Configuration'

    def save(self, *args, **kwargs):
        # Enforce a single configuration row (pk = 1).
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls) -> 'HostelConfiguration':
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Hostel Configuration'


class FacilitySelectionWindow(TimeStampedModel):
    """Semester-start window during which students may choose their facilities."""

    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_selection_windows',
    )
    title = models.CharField(max_length=128, blank=True, default='')
    opens_at = models.DateTimeField()
    closes_at = models.DateTimeField()
    is_active = models.BooleanField(default=True, db_index=True)
    allow_self_selection = models.BooleanField(
        default=True,
        help_text='When disabled, submissions are converted into approval requests.',
    )
    require_approval = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_facility_selection_window'
        ordering = ('-opens_at',)
        verbose_name = 'Facility Selection Window'
        verbose_name_plural = 'Facility Selection Windows'
        constraints = [
            models.UniqueConstraint(
                fields=['academic_year'],
                condition=Q(is_active=True),
                name='uniq_active_hostel_window_per_year',
            ),
        ]

    def clean(self):
        if self.opens_at and self.closes_at and self.closes_at <= self.opens_at:
            raise DjangoValidationError({'closes_at': 'Closing time must be after opening time.'})

    @property
    def is_open_now(self) -> bool:
        now = timezone.now()
        return bool(self.is_active and self.opens_at <= now <= self.closes_at)

    def __str__(self):
        return self.title or f'Selection window {self.opens_at:%Y-%m-%d}'


# ---------------------------------------------------------------------------
# Student facility selection
# ---------------------------------------------------------------------------


class StudentFacilityProfile(TimeStampedModel):
    """Current residence category + transport facility for a student.

    ``residence_category`` is intentionally allowed to be blank so that the
    dashboard can report students who have not made a selection yet.
    """

    student = models.OneToOneField(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_facility',
    )
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_facility_profiles',
    )
    residence_category = models.CharField(
        max_length=16,
        choices=RESIDENCE_CATEGORY_CHOICES,
        blank=True,
        default='',
        db_index=True,
    )
    uses_college_bus = models.BooleanField(default=False, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=FACILITY_STATUS_CHOICES,
        default=FACILITY_STATUS_NOT_SUBMITTED,
        db_index=True,
    )
    day_scholar_address = models.TextField(
        blank=True,
        default='',
        help_text='Current residential address for Day Scholars.',
    )
    emergency_contact_name = models.CharField(max_length=150, blank=True, default='')
    emergency_contact_phone = models.CharField(max_length=32, blank=True, default='')
    profile_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_facilities_verified',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_facilities_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_remarks = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_student_facility_profile'
        verbose_name = 'Student Facility Profile'
        verbose_name_plural = 'Student Facility Profiles'
        indexes = [
            models.Index(fields=['residence_category', 'status'], name='hostel_fac_cat_status_idx'),
        ]

    @property
    def is_hosteller(self) -> bool:
        return self.residence_category == RESIDENCE_HOSTELLER

    @property
    def is_day_scholar(self) -> bool:
        return self.residence_category == RESIDENCE_DAY_SCHOLAR

    @property
    def has_selection(self) -> bool:
        return bool(self.residence_category)

    def __str__(self):
        return f'{self.student.reg_no}: {self.residence_category or "Not selected"}'


class FacilityChangeRequest(TimeStampedModel):
    """Approval workflow for first-time selections and category changes."""

    STATUS_PENDING = 'PENDING'
    STATUS_APPROVED = 'APPROVED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CANCELLED, 'Cancelled'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_facility_requests',
    )
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_facility_requests',
    )
    previous_category = models.CharField(max_length=16, blank=True, default='')
    requested_category = models.CharField(max_length=16, choices=RESIDENCE_CATEGORY_CHOICES)
    previous_uses_college_bus = models.BooleanField(default=False)
    requested_uses_college_bus = models.BooleanField(default=False)
    day_scholar_address = models.TextField(blank=True, default='')
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_facility_requests_made',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_facility_requests_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_facility_change_request'
        ordering = ('-created_at',)
        verbose_name = 'Facility Change Request'
        verbose_name_plural = 'Facility Change Requests'

    def __str__(self):
        return f'{self.student.reg_no}: {self.previous_category or "-"} -> {self.requested_category} ({self.status})'


class FacilityHistory(models.Model):
    """Immutable audit trail of approved facility assignments."""

    SOURCE_SELF = 'SELF'
    SOURCE_ADMIN = 'ADMIN'
    SOURCE_APPROVAL = 'APPROVAL'
    SOURCE_IMPORT = 'IMPORT'
    SOURCE_CHOICES = (
        (SOURCE_SELF, 'Student Self Service'),
        (SOURCE_ADMIN, 'Administrator'),
        (SOURCE_APPROVAL, 'Approved Request'),
        (SOURCE_IMPORT, 'Bulk Import'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_facility_history',
    )
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_facility_history',
    )
    residence_category = models.CharField(max_length=16, choices=RESIDENCE_CATEGORY_CHOICES)
    uses_college_bus = models.BooleanField(default=False)
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default=SOURCE_SELF)
    effective_from = models.DateField(default=timezone.localdate)
    effective_to = models.DateField(null=True, blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_facility_history_changes',
    )
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'hostel_facility_history'
        ordering = ('-effective_from', '-id')
        verbose_name = 'Facility History'
        verbose_name_plural = 'Facility History'

    def __str__(self):
        return f'{self.student.reg_no}: {self.residence_category} from {self.effective_from}'


# ---------------------------------------------------------------------------
# Infrastructure: Campus -> Building -> Floor -> Room -> Bed
# ---------------------------------------------------------------------------


class Building(TimeStampedModel):
    TYPE_ACADEMIC = 'ACADEMIC'
    TYPE_HOSTEL = 'HOSTEL'
    TYPE_LABORATORY = 'LABORATORY'
    TYPE_LIBRARY = 'LIBRARY'
    TYPE_ADMINISTRATIVE = 'ADMINISTRATIVE'
    TYPE_OTHER = 'OTHER'
    TYPE_CHOICES = (
        (TYPE_ACADEMIC, 'Academic'),
        (TYPE_HOSTEL, 'Hostel'),
        (TYPE_LABORATORY, 'Laboratory'),
        (TYPE_LIBRARY, 'Library'),
        (TYPE_ADMINISTRATIVE, 'Administrative'),
        (TYPE_OTHER, 'Other'),
    )

    STATUS_ACTIVE = 'ACTIVE'
    STATUS_INACTIVE = 'INACTIVE'
    STATUS_ARCHIVED = 'ARCHIVED'
    STATUS_CHOICES = (
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),
        (STATUS_ARCHIVED, 'Archived'),
    )

    code = models.CharField(max_length=32, unique=True, help_text='Unique building code, e.g. BH-1')
    name = models.CharField(max_length=150)
    building_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_ACADEMIC, db_index=True)
    hostel_category = models.CharField(
        max_length=16,
        choices=HOSTEL_CATEGORY_CHOICES,
        blank=True,
        default='',
        db_index=True,
        help_text='For hostel buildings: Boys / Girls / Staff / Mixed. Rooms inherit this when blank.',
    )
    campus_location = models.CharField(max_length=150, blank=True, default='')
    address = models.TextField(blank=True, default='')
    planned_floors = models.PositiveSmallIntegerField(
        default=0,
        help_text='Planned floor count (display only). Actual floors are computed from registered floor records.',
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_building'
        ordering = ('name',)
        verbose_name = 'Building'
        verbose_name_plural = 'Buildings'

    @property
    def is_hostel(self) -> bool:
        return self.building_type == self.TYPE_HOSTEL

    def __str__(self):
        return f'{self.code} - {self.name}'


class HostelWardenAssignment(TimeStampedModel):
    DESIGNATION_WARDEN = 'WARDEN'
    DESIGNATION_DEPUTY = 'DEPUTY_WARDEN'
    DESIGNATION_MATRON = 'MATRON'
    DESIGNATION_CHOICES = (
        (DESIGNATION_WARDEN, 'Warden'),
        (DESIGNATION_DEPUTY, 'Deputy Warden'),
        (DESIGNATION_MATRON, 'Matron'),
    )

    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name='warden_assignments')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hostel_warden_assignments',
    )
    designation = models.CharField(max_length=20, choices=DESIGNATION_CHOICES, default=DESIGNATION_WARDEN)
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_warden_assignment'
        ordering = ('building', 'designation')
        verbose_name = 'Hostel Warden Assignment'
        verbose_name_plural = 'Hostel Warden Assignments'
        constraints = [
            models.UniqueConstraint(
                fields=['building', 'user', 'designation'],
                condition=Q(is_active=True),
                name='uniq_active_warden_per_building',
            ),
        ]

    def __str__(self):
        return f'{self.building.code}: {self.user} ({self.designation})'


class Floor(TimeStampedModel):
    STATUS_ACTIVE = 'ACTIVE'
    STATUS_MAINTENANCE = 'MAINTENANCE'
    STATUS_INACTIVE = 'INACTIVE'
    STATUS_CHOICES = (
        (STATUS_ACTIVE, 'Active'),
        (STATUS_MAINTENANCE, 'Under Maintenance'),
        (STATUS_INACTIVE, 'Inactive'),
    )

    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name='floors')
    floor_number = models.PositiveSmallIntegerField(help_text='1 = ground/first configured floor')
    name = models.CharField(max_length=64, blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    is_available_for_allocation = models.BooleanField(default=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_floor'
        ordering = ('building', 'floor_number')
        verbose_name = 'Floor'
        verbose_name_plural = 'Floors'
        constraints = [
            models.UniqueConstraint(fields=['building', 'floor_number'], name='uniq_floor_number_per_building'),
        ]

    def __str__(self):
        return f'{self.building.code} / Floor {self.floor_number}'


class Room(TimeStampedModel):
    TYPE_SINGLE = 'SINGLE'
    TYPE_DOUBLE = 'DOUBLE'
    TYPE_TRIPLE = 'TRIPLE'
    TYPE_QUADRUPLE = 'QUADRUPLE'
    TYPE_DORMITORY = 'DORMITORY'
    TYPE_CLASSROOM = 'CLASSROOM'
    TYPE_LAB = 'LAB'
    TYPE_OFFICE = 'OFFICE'
    TYPE_OTHER = 'OTHER'
    TYPE_CHOICES = (
        (TYPE_SINGLE, 'Single Occupancy'),
        (TYPE_DOUBLE, 'Double Occupancy'),
        (TYPE_TRIPLE, 'Triple Occupancy'),
        (TYPE_QUADRUPLE, 'Four Occupancy'),
        (TYPE_DORMITORY, 'Dormitory'),
        (TYPE_CLASSROOM, 'Classroom'),
        (TYPE_LAB, 'Laboratory'),
        (TYPE_OFFICE, 'Office'),
        (TYPE_OTHER, 'Other'),
    )

    PURPOSE_HOSTEL = 'HOSTEL'
    PURPOSE_ACADEMIC = 'ACADEMIC'
    PURPOSE_LABORATORY = 'LABORATORY'
    PURPOSE_ADMIN = 'ADMIN'
    PURPOSE_OTHER = 'OTHER'
    PURPOSE_CHOICES = (
        (PURPOSE_HOSTEL, 'Hostel'),
        (PURPOSE_ACADEMIC, 'Academic'),
        (PURPOSE_LABORATORY, 'Laboratory'),
        (PURPOSE_ADMIN, 'Administrative'),
        (PURPOSE_OTHER, 'Other'),
    )

    STATUS_AVAILABLE = 'AVAILABLE'
    STATUS_PARTIALLY_OCCUPIED = 'PARTIALLY_OCCUPIED'
    STATUS_FULL = 'FULL'
    STATUS_MAINTENANCE = 'MAINTENANCE'
    STATUS_INACTIVE = 'INACTIVE'
    STATUS_CHOICES = (
        (STATUS_AVAILABLE, 'Available'),
        (STATUS_PARTIALLY_OCCUPIED, 'Partially Occupied'),
        (STATUS_FULL, 'Full'),
        (STATUS_MAINTENANCE, 'Maintenance'),
        (STATUS_INACTIVE, 'Inactive'),
    )

    HOSTEL_BOYS = HOSTEL_CAT_BOYS
    HOSTEL_GIRLS = HOSTEL_CAT_GIRLS
    HOSTEL_STAFF = HOSTEL_CAT_STAFF
    HOSTEL_MIXED = HOSTEL_CAT_MIXED
    HOSTEL_CATEGORY_CHOICES = HOSTEL_CATEGORY_CHOICES

    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name='rooms')
    floor = models.ForeignKey(Floor, on_delete=models.CASCADE, related_name='rooms')
    room_number = models.CharField(max_length=32)
    room_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_DOUBLE)
    room_purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default=PURPOSE_HOSTEL, db_index=True)
    capacity = models.PositiveSmallIntegerField(default=0, help_text='Maximum students that may occupy this room.')
    occupied_count = models.PositiveSmallIntegerField(
        default=0,
        help_text='Cached active allocation count. Recalculated from allocations, never edited manually.',
    )
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default=STATUS_AVAILABLE, db_index=True)
    facilities = models.JSONField(default=list, blank=True, help_text='List of facilities, e.g. ["Fan", "Wi-Fi"].')
    remarks = models.TextField(blank=True, default='')
    hostel_category = models.CharField(max_length=16, choices=HOSTEL_CATEGORY_CHOICES, blank=True, default='')
    bed_count = models.PositiveSmallIntegerField(null=True, blank=True)
    warden = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_rooms_responsible',
    )

    class Meta:
        db_table = 'hostel_room'
        ordering = ('building', 'floor__floor_number', 'room_number')
        verbose_name = 'Room'
        verbose_name_plural = 'Rooms'
        constraints = [
            models.UniqueConstraint(fields=['building', 'room_number'], name='uniq_room_number_per_building'),
            models.CheckConstraint(check=Q(capacity__gte=0), name='hostel_room_capacity_gte_zero'),
        ]

    def clean(self):
        super().clean()
        if self.floor_id and self.building_id and self.floor.building_id != self.building_id:
            raise DjangoValidationError({'floor': 'The selected floor does not belong to this building.'})
        if self.bed_count is not None and self.capacity and self.bed_count > self.capacity:
            raise DjangoValidationError({'bed_count': 'Bed count cannot exceed room capacity.'})
        if self.pk:
            active = RoomAllocation.objects.filter(room_id=self.pk, status=ALLOCATION_ACTIVE).count()
            if self.capacity < active:
                raise DjangoValidationError(
                    {'capacity': f'Capacity cannot be lower than the {active} active occupant(s) in this room.'}
                )
            if active and self.room_purpose != self.PURPOSE_HOSTEL:
                raise DjangoValidationError(
                    {'room_purpose': 'Cannot change the purpose of a room that has active student allocations.'}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def available_capacity(self) -> int:
        return max(int(self.capacity or 0) - int(self.occupied_count or 0), 0)

    @property
    def is_hostel_room(self) -> bool:
        return self.room_purpose == self.PURPOSE_HOSTEL

    def __str__(self):
        return f'{self.building.code}/{self.room_number}'



    @property
    def effective_hostel_category(self) -> str:
        """Room category, falling back to the parent building category."""
        if self.hostel_category:
            return self.hostel_category
        try:
            return self.building.hostel_category or ''
        except Exception:
            return ''
class Bed(TimeStampedModel):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='beds')
    bed_number = models.CharField(max_length=16)
    is_active = models.BooleanField(default=True, db_index=True)
    remarks = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        db_table = 'hostel_bed'
        ordering = ('room', 'bed_number')
        verbose_name = 'Bed'
        verbose_name_plural = 'Beds'
        constraints = [
            models.UniqueConstraint(fields=['room', 'bed_number'], name='uniq_bed_number_per_room'),
        ]

    def __str__(self):
        return f'{self.room} / Bed {self.bed_number}'


class RoomAllocation(TimeStampedModel):
    STATUS_ACTIVE = ALLOCATION_ACTIVE
    STATUS_VACATED = 'VACATED'
    STATUS_TRANSFERRED = 'TRANSFERRED'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_CHOICES = (
        (STATUS_ACTIVE, 'Active'),
        (STATUS_VACATED, 'Vacated'),
        (STATUS_TRANSFERRED, 'Transferred'),
        (STATUS_CANCELLED, 'Cancelled'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_allocations',
    )
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name='allocations')
    bed = models.ForeignKey(Bed, on_delete=models.SET_NULL, null=True, blank=True, related_name='allocations')
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_allocations',
    )
    start_date = models.DateField(default=timezone.localdate)
    expected_end_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    allocated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_allocations_made',
    )
    vacated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_allocations_vacated',
    )
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_room_allocation'
        ordering = ('-start_date', '-id')
        verbose_name = 'Room Allocation'
        verbose_name_plural = 'Room Allocations'
        indexes = [
            models.Index(fields=['room', 'status'], name='hostel_alloc_room_status_idx'),
            models.Index(fields=['student', 'status'], name='hostel_alloc_stu_status_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['student'],
                condition=Q(status='ACTIVE'),
                name='uniq_active_hostel_allocation_per_student',
            ),
            models.UniqueConstraint(
                fields=['bed'],
                condition=Q(status='ACTIVE', bed__isnull=False),
                name='uniq_active_hostel_allocation_per_bed',
            ),
        ]

    def clean(self):
        super().clean()
        if self.bed_id and self.room_id and self.bed.room_id != self.room_id:
            raise DjangoValidationError({'bed': 'The selected bed does not belong to this room.'})
        if self.expected_end_date and self.start_date and self.expected_end_date < self.start_date:
            raise DjangoValidationError({'expected_end_date': 'Expected end date cannot be before the start date.'})
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise DjangoValidationError({'end_date': 'End date cannot be before the start date.'})

    @property
    def is_active(self) -> bool:
        return self.status == self.STATUS_ACTIVE

    def __str__(self):
        return f'{self.student.reg_no} -> {self.room} ({self.status})'


# ---------------------------------------------------------------------------
# Transport (College Bus)
# ---------------------------------------------------------------------------


class TransportRoute(TimeStampedModel):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=150)
    origin = models.CharField(max_length=150, blank=True, default='')
    destination = models.CharField(max_length=150, blank=True, default='')
    distance_km = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_transport_route'
        ordering = ('name',)
        verbose_name = 'Transport Route'
        verbose_name_plural = 'Transport Routes'

    def __str__(self):
        return f'{self.code} - {self.name}'


class TransportStop(TimeStampedModel):
    route = models.ForeignKey(TransportRoute, on_delete=models.CASCADE, related_name='stops')
    name = models.CharField(max_length=150)
    sequence = models.PositiveSmallIntegerField(default=1)
    boarding_time = models.TimeField(null=True, blank=True)
    fee_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Overrides the route fee when set.',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'hostel_transport_stop'
        ordering = ('route', 'sequence')
        verbose_name = 'Transport Stop'
        verbose_name_plural = 'Transport Stops'
        constraints = [
            models.UniqueConstraint(fields=['route', 'name'], name='uniq_transport_stop_per_route'),
        ]

    def __str__(self):
        return f'{self.route.code} / {self.name}'


class CollegeBus(TimeStampedModel):
    bus_number = models.CharField(max_length=32, unique=True)
    route = models.ForeignKey(
        TransportRoute,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='buses',
    )
    capacity = models.PositiveSmallIntegerField(default=0)
    driver_name = models.CharField(max_length=150, blank=True, default='')
    driver_contact = models.CharField(max_length=32, blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_college_bus'
        ordering = ('bus_number',)
        verbose_name = 'College Bus'
        verbose_name_plural = 'College Buses'

    def __str__(self):
        return self.bus_number


class TransportAssignment(TimeStampedModel):
    STATUS_PENDING = 'PENDING'
    STATUS_ACTIVE = 'ACTIVE'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_COMPLETED, 'Completed'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_transport_assignments',
    )
    route = models.ForeignKey(TransportRoute, on_delete=models.PROTECT, related_name='assignments')
    bus = models.ForeignKey(CollegeBus, on_delete=models.SET_NULL, null=True, blank=True, related_name='assignments')
    stop = models.ForeignKey(TransportStop, on_delete=models.SET_NULL, null=True, blank=True, related_name='assignments')
    boarding_point = models.CharField(max_length=255, blank=True, default='')
    stop_name = models.CharField(max_length=150, blank=True, default='')
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_transport_assignments',
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_transport_assignments_made',
    )
    assigned_at = models.DateTimeField(default=timezone.now)
    end_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_transport_assignment'
        ordering = ('-assigned_at',)
        verbose_name = 'Transport Assignment'
        verbose_name_plural = 'Transport Assignments'
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'academic_year'],
                condition=Q(status__in=['PENDING', 'ACTIVE']),
                name='uniq_active_transport_assignment_per_student_year',
            ),
        ]

    def __str__(self):
        return f'{self.student.reg_no} -> {self.route.code} ({self.status})'


# ---------------------------------------------------------------------------
# Fees
# ---------------------------------------------------------------------------


class FeeStructure(TimeStampedModel):
    FEE_TYPE_HOSTEL = 'HOSTEL'
    FEE_TYPE_MESS = 'MESS'
    FEE_TYPE_TRANSPORT = 'TRANSPORT'
    FEE_TYPE_OTHER = 'OTHER'
    FEE_TYPE_CHOICES = (
        (FEE_TYPE_HOSTEL, 'Hostel Fee'),
        (FEE_TYPE_MESS, 'Mess Fee'),
        (FEE_TYPE_TRANSPORT, 'Transport Fee'),
        (FEE_TYPE_OTHER, 'Other'),
    )

    name = models.CharField(max_length=150)
    fee_type = models.CharField(max_length=16, choices=FEE_TYPE_CHOICES, default=FEE_TYPE_HOSTEL, db_index=True)
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_fee_structures',
    )
    building = models.ForeignKey(
        Building,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fee_structures',
        help_text='Optional hostel building this fee applies to.',
    )
    route = models.ForeignKey(
        TransportRoute,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fee_structures',
    )
    room_type = models.CharField(max_length=20, blank=True, default='')
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    due_date = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = 'hostel_fee_structure'
        ordering = ('fee_type', 'name')
        verbose_name = 'Fee Structure'
        verbose_name_plural = 'Fee Structures'

    def __str__(self):
        return f'{self.name} ({self.fee_type})'


class StudentFee(TimeStampedModel):
    STATUS_PENDING = 'PENDING'
    STATUS_PARTIAL = 'PARTIAL'
    STATUS_PAID = 'PAID'
    STATUS_WAIVED = 'WAIVED'
    STATUS_OVERDUE = 'OVERDUE'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_PARTIAL, 'Partially Paid'),
        (STATUS_PAID, 'Paid'),
        (STATUS_WAIVED, 'Waived'),
        (STATUS_OVERDUE, 'Overdue'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_fees',
    )
    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.PROTECT, related_name='student_fees')
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_student_fees',
    )
    amount_due = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    due_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_student_fee'
        ordering = ('-due_date', '-id')
        verbose_name = 'Student Fee'
        verbose_name_plural = 'Student Fees'
        constraints = [
            models.UniqueConstraint(fields=['student', 'fee_structure'], name='uniq_student_fee_per_structure'),
        ]

    @property
    def balance(self):
        return max((self.amount_due or 0) - (self.amount_paid or 0), 0)

    def recalculate(self, save: bool = True):
        paid = sum((p.amount or 0) for p in self.payments.all())
        self.amount_paid = paid
        if self.status == self.STATUS_WAIVED:
            pass
        elif paid <= 0:
            self.status = (
                self.STATUS_OVERDUE
                if self.due_date and self.due_date < timezone.localdate()
                else self.STATUS_PENDING
            )
        elif paid < (self.amount_due or 0):
            self.status = self.STATUS_PARTIAL
        else:
            self.status = self.STATUS_PAID
        if save:
            super().save(update_fields=['amount_paid', 'status', 'updated_at'])
        return self.status

    def __str__(self):
        return f'{self.student.reg_no} - {self.fee_structure.name}'


class FeePayment(TimeStampedModel):
    METHOD_CASH = 'CASH'
    METHOD_UPI = 'UPI'
    METHOD_CARD = 'CARD'
    METHOD_NEFT = 'NEFT'
    METHOD_CHEQUE = 'CHEQUE'
    METHOD_OTHER = 'OTHER'
    METHOD_CHOICES = (
        (METHOD_CASH, 'Cash'),
        (METHOD_UPI, 'UPI'),
        (METHOD_CARD, 'Card'),
        (METHOD_NEFT, 'NEFT / Bank Transfer'),
        (METHOD_CHEQUE, 'Cheque'),
        (METHOD_OTHER, 'Other'),
    )

    student_fee = models.ForeignKey(StudentFee, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    paid_on = models.DateField(default=timezone.localdate)
    method = models.CharField(max_length=16, choices=METHOD_CHOICES, default=METHOD_CASH)
    reference_no = models.CharField(max_length=100, blank=True, default='')
    receipt_number = models.CharField(max_length=32, unique=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_fee_payments_recorded',
    )
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_fee_payment'
        ordering = ('-paid_on', '-id')
        verbose_name = 'Fee Payment'
        verbose_name_plural = 'Fee Payments'

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            stamp = timezone.localdate().strftime('%Y%m%d')
            for _ in range(20):
                candidate = f'HST{stamp}{_random_token(4)}'
                if not FeePayment.objects.filter(receipt_number=candidate).exists():
                    self.receipt_number = candidate
                    break
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.receipt_number} ({self.amount})'


# ---------------------------------------------------------------------------
# Complaints & maintenance
# ---------------------------------------------------------------------------


class Complaint(TimeStampedModel):
    CATEGORY_ELECTRICAL = 'ELECTRICAL'
    CATEGORY_PLUMBING = 'PLUMBING'
    CATEGORY_INTERNET = 'INTERNET'
    CATEGORY_FURNITURE = 'FURNITURE'
    CATEGORY_HOUSEKEEPING = 'HOUSEKEEPING'
    CATEGORY_OTHER = 'OTHER'
    CATEGORY_CHOICES = (
        (CATEGORY_ELECTRICAL, 'Electrical'),
        (CATEGORY_PLUMBING, 'Plumbing'),
        (CATEGORY_INTERNET, 'Internet'),
        (CATEGORY_FURNITURE, 'Furniture'),
        (CATEGORY_HOUSEKEEPING, 'Housekeeping'),
        (CATEGORY_OTHER, 'Other'),
    )

    PRIORITY_LOW = 'LOW'
    PRIORITY_MEDIUM = 'MEDIUM'
    PRIORITY_HIGH = 'HIGH'
    PRIORITY_URGENT = 'URGENT'
    PRIORITY_CHOICES = (
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MEDIUM, 'Medium'),
        (PRIORITY_HIGH, 'High'),
        (PRIORITY_URGENT, 'Urgent'),
    )

    STATUS_OPEN = 'OPEN'
    STATUS_ASSIGNED = 'ASSIGNED'
    STATUS_IN_PROGRESS = 'IN_PROGRESS'
    STATUS_RESOLVED = 'RESOLVED'
    STATUS_CLOSED = 'CLOSED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CHOICES = (
        (STATUS_OPEN, 'Open'),
        (STATUS_ASSIGNED, 'Assigned'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_RESOLVED, 'Resolved'),
        (STATUS_CLOSED, 'Closed'),
        (STATUS_REJECTED, 'Rejected'),
    )

    ticket_no = models.CharField(max_length=32, unique=True, blank=True)
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_complaints',
    )
    building = models.ForeignKey(Building, on_delete=models.SET_NULL, null=True, blank=True, related_name='complaints')
    floor = models.ForeignKey(Floor, on_delete=models.SET_NULL, null=True, blank=True, related_name='complaints')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True, related_name='complaints')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default=CATEGORY_OTHER, db_index=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM, db_index=True)
    subject = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    attachment = models.FileField(upload_to='hostel/complaints/', null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_hostel_complaints',
    )
    resolution_notes = models.TextField(blank=True, default='')
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'hostel_complaint'
        ordering = ('-created_at',)
        verbose_name = 'Complaint'
        verbose_name_plural = 'Complaints'

    def save(self, *args, **kwargs):
        if not self.ticket_no:
            stamp = timezone.localdate().strftime('%Y%m%d')
            for _ in range(20):
                candidate = f'HC{stamp}{_random_token(4)}'
                if not Complaint.objects.filter(ticket_no=candidate).exists():
                    self.ticket_no = candidate
                    break
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.ticket_no} - {self.subject}'


class ComplaintStatusHistory(models.Model):
    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name='history')
    status = models.CharField(max_length=16, choices=Complaint.STATUS_CHOICES)
    note = models.TextField(blank=True, default='')
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_complaint_status_changes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'hostel_complaint_status_history'
        ordering = ('created_at',)
        verbose_name = 'Complaint Status History'
        verbose_name_plural = 'Complaint Status History'

    def __str__(self):
        return f'{self.complaint.ticket_no}: {self.status}'


# ---------------------------------------------------------------------------
# Mess
# ---------------------------------------------------------------------------


class MessMenu(TimeStampedModel):
    MEAL_BREAKFAST = 'BREAKFAST'
    MEAL_LUNCH = 'LUNCH'
    MEAL_SNACKS = 'SNACKS'
    MEAL_DINNER = 'DINNER'
    MEAL_CHOICES = (
        (MEAL_BREAKFAST, 'Breakfast'),
        (MEAL_LUNCH, 'Lunch'),
        (MEAL_SNACKS, 'Snacks'),
        (MEAL_DINNER, 'Dinner'),
    )

    building = models.ForeignKey(
        Building,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='mess_menus',
    )
    date = models.DateField(default=timezone.localdate, db_index=True)
    meal_type = models.CharField(max_length=16, choices=MEAL_CHOICES)
    items = models.TextField(help_text='Menu items, one per line or comma separated.')
    is_published = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_mess_menus_created',
    )

    class Meta:
        db_table = 'hostel_mess_menu'
        ordering = ('-date', 'meal_type')
        verbose_name = 'Mess Menu'
        verbose_name_plural = 'Mess Menus'
        constraints = [
            models.UniqueConstraint(
                fields=['date', 'meal_type', 'building'],
                name='uniq_mess_menu_per_day_meal_building',
            ),
        ]

    def __str__(self):
        return f'{self.date} {self.meal_type}'


class MessPreference(TimeStampedModel):
    PREF_VEG = 'VEG'
    PREF_NON_VEG = 'NON_VEG'
    PREF_EGG = 'EGG'
    PREF_SPECIAL = 'SPECIAL'
    PREF_CHOICES = (
        (PREF_VEG, 'Vegetarian'),
        (PREF_NON_VEG, 'Non Vegetarian'),
        (PREF_EGG, 'Eggitarian'),
        (PREF_SPECIAL, 'Special Diet'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_mess_preferences',
    )
    preference = models.CharField(max_length=16, choices=PREF_CHOICES, default=PREF_VEG)
    academic_year = models.ForeignKey(
        'academics.AcademicYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_mess_preferences',
    )
    notes = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_mess_preference'
        verbose_name = 'Mess Preference'
        verbose_name_plural = 'Mess Preferences'
        constraints = [
            models.UniqueConstraint(fields=['student', 'academic_year'], name='uniq_mess_preference_per_student_year'),
        ]

    def __str__(self):
        return f'{self.student.reg_no}: {self.preference}'


class MessFeedback(TimeStampedModel):
    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_mess_feedback',
    )
    date = models.DateField(default=timezone.localdate)
    meal_type = models.CharField(max_length=16, choices=MessMenu.MEAL_CHOICES)
    rating = models.PositiveSmallIntegerField(help_text='1 (poor) to 5 (excellent)')
    comments = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_mess_feedback'
        ordering = ('-date', '-id')
        verbose_name = 'Mess Feedback'
        verbose_name_plural = 'Mess Feedback'
        constraints = [
            models.UniqueConstraint(fields=['student', 'date', 'meal_type'], name='uniq_mess_feedback_per_student_meal'),
            models.CheckConstraint(check=Q(rating__gte=1) & Q(rating__lte=5), name='hostel_mess_rating_range'),
        ]

    def __str__(self):
        return f'{self.student.reg_no} {self.date} {self.meal_type}: {self.rating}'


class MessRequest(TimeStampedModel):
    TYPE_SPECIAL_MEAL = 'SPECIAL_MEAL'
    TYPE_MEAL_CHANGE = 'MEAL_CHANGE'
    TYPE_OTHER = 'OTHER'
    TYPE_CHOICES = (
        (TYPE_SPECIAL_MEAL, 'Special Meal'),
        (TYPE_MEAL_CHANGE, 'Meal Change'),
        (TYPE_OTHER, 'Other'),
    )
    STATUS_PENDING = 'PENDING'
    STATUS_APPROVED = 'APPROVED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_COMPLETED, 'Completed'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_mess_requests',
    )
    request_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_OTHER)
    description = models.TextField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_mess_requests_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_mess_request'
        ordering = ('-created_at',)
        verbose_name = 'Mess Request'
        verbose_name_plural = 'Mess Requests'

    def __str__(self):
        return f'{self.student.reg_no}: {self.request_type} ({self.status})'


# ---------------------------------------------------------------------------
# Visitors, leave and movement
# ---------------------------------------------------------------------------


class Visitor(TimeStampedModel):
    STATUS_CHECKED_IN = 'CHECKED_IN'
    STATUS_CHECKED_OUT = 'CHECKED_OUT'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_CHOICES = (
        (STATUS_CHECKED_IN, 'Checked In'),
        (STATUS_CHECKED_OUT, 'Checked Out'),
        (STATUS_CANCELLED, 'Cancelled'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_visitors',
    )
    visitor_name = models.CharField(max_length=150)
    contact_number = models.CharField(max_length=32, blank=True, default='')
    id_proof_type = models.CharField(max_length=64, blank=True, default='')
    id_proof_number = models.CharField(max_length=64, blank=True, default='')
    purpose = models.CharField(max_length=255, blank=True, default='')
    building = models.ForeignKey(Building, on_delete=models.SET_NULL, null=True, blank=True, related_name='visitors')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True, related_name='visitors')
    entry_at = models.DateTimeField(default=timezone.now)
    exit_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_CHECKED_IN, db_index=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_visitors_approved',
    )
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_visitor'
        ordering = ('-entry_at',)
        verbose_name = 'Visitor'
        verbose_name_plural = 'Visitors'

    def __str__(self):
        return f'{self.visitor_name} -> {self.student.reg_no}'


class StudentLeaveRequest(TimeStampedModel):
    LEAVE_HOME = 'HOME'
    LEAVE_MEDICAL = 'MEDICAL'
    LEAVE_OTHER = 'OTHER'
    LEAVE_TYPE_CHOICES = (
        (LEAVE_HOME, 'Home Visit'),
        (LEAVE_MEDICAL, 'Medical'),
        (LEAVE_OTHER, 'Other'),
    )
    STATUS_PENDING = 'PENDING'
    STATUS_APPROVED = 'APPROVED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_COMPLETED, 'Completed'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_leave_requests',
    )
    leave_type = models.CharField(max_length=16, choices=LEAVE_TYPE_CHOICES, default=LEAVE_OTHER)
    from_date = models.DateField()
    to_date = models.DateField()
    reason = models.TextField()
    destination = models.CharField(max_length=255, blank=True, default='')
    guardian_contact = models.CharField(max_length=32, blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_leave_requests_approved',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_student_leave_request'
        ordering = ('-from_date', '-id')
        verbose_name = 'Student Leave Request'
        verbose_name_plural = 'Student Leave Requests'

    def clean(self):
        super().clean()
        if self.from_date and self.to_date and self.to_date < self.from_date:
            raise DjangoValidationError({'to_date': 'To date cannot be before the from date.'})

    def __str__(self):
        return f'{self.student.reg_no}: {self.from_date} -> {self.to_date}'


class LateEntry(TimeStampedModel):
    STATUS_PENDING = 'PENDING'
    STATUS_APPROVED = 'APPROVED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_late_entries',
    )
    date = models.DateField(default=timezone.localdate)
    expected_time = models.TimeField(null=True, blank=True)
    actual_time = models.TimeField(null=True, blank=True)
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_late_entries_approved',
    )
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_late_entry'
        ordering = ('-date', '-id')
        verbose_name = 'Late Entry'
        verbose_name_plural = 'Late Entries'

    def __str__(self):
        return f'{self.student.reg_no} {self.date}'


# ---------------------------------------------------------------------------
# Inventory & assets
# ---------------------------------------------------------------------------


class Asset(TimeStampedModel):
    CONDITION_GOOD = 'GOOD'
    CONDITION_FAIR = 'FAIR'
    CONDITION_DAMAGED = 'DAMAGED'
    CONDITION_REPAIR = 'UNDER_REPAIR'
    CONDITION_CHOICES = (
        (CONDITION_GOOD, 'Good'),
        (CONDITION_FAIR, 'Fair'),
        (CONDITION_DAMAGED, 'Damaged'),
        (CONDITION_REPAIR, 'Under Repair'),
    )

    asset_code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=150)
    building = models.ForeignKey(Building, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    floor = models.ForeignKey(Floor, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    quantity = models.PositiveIntegerField(default=1)
    condition = models.CharField(max_length=16, choices=CONDITION_CHOICES, default=CONDITION_GOOD, db_index=True)
    custodian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_assets_custodian',
    )
    purchase_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = 'hostel_asset'
        ordering = ('asset_code',)
        verbose_name = 'Asset'
        verbose_name_plural = 'Assets'

    def clean(self):
        super().clean()
        if self.floor_id and self.building_id and self.floor.building_id != self.building_id:
            raise DjangoValidationError({'floor': 'The selected floor does not belong to this building.'})
        if self.room_id and self.building_id and self.room.building_id != self.building_id:
            raise DjangoValidationError({'room': 'The selected room does not belong to this building.'})
        if self.room_id and self.floor_id and self.room.floor_id != self.floor_id:
            raise DjangoValidationError({'room': 'The selected room does not belong to this floor.'})

    def __str__(self):
        return f'{self.asset_code} - {self.name}'


class AssetMaintenanceLog(TimeStampedModel):
    STATUS_PENDING = 'PENDING'
    STATUS_IN_PROGRESS = 'IN_PROGRESS'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_COMPLETED, 'Completed'),
    )

    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='maintenance_logs')
    issue = models.TextField()
    action_taken = models.TextField(blank=True, default='')
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_asset_maintenance_done',
    )
    performed_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)

    class Meta:
        db_table = 'hostel_asset_maintenance_log'
        ordering = ('-performed_at',)
        verbose_name = 'Asset Maintenance Log'
        verbose_name_plural = 'Asset Maintenance Logs'

    def __str__(self):
        return f'{self.asset.asset_code} - {self.status}'


# ---------------------------------------------------------------------------
# Notices
# ---------------------------------------------------------------------------


class HostelNotice(TimeStampedModel):
    TYPE_GENERAL = 'GENERAL'
    TYPE_FEE = 'FEE'
    TYPE_COMPLAINT = 'COMPLAINT'
    TYPE_ALLOCATION = 'ALLOCATION'
    TYPE_TRANSPORT = 'TRANSPORT'
    TYPE_EMERGENCY = 'EMERGENCY'
    TYPE_CHOICES = (
        (TYPE_GENERAL, 'General'),
        (TYPE_FEE, 'Fee Reminder'),
        (TYPE_COMPLAINT, 'Complaint Update'),
        (TYPE_ALLOCATION, 'Allocation'),
        (TYPE_TRANSPORT, 'Transport'),
        (TYPE_EMERGENCY, 'Emergency'),
    )

    AUDIENCE_ALL = 'ALL'
    AUDIENCE_HOSTELLERS = 'HOSTELLERS'
    AUDIENCE_DAY_SCHOLARS = 'DAY_SCHOLARS'
    AUDIENCE_BUS_USERS = 'BUS_USERS'
    AUDIENCE_BUILDING = 'BUILDING'
    AUDIENCE_CHOICES = (
        (AUDIENCE_ALL, 'All Students'),
        (AUDIENCE_HOSTELLERS, 'Hostellers'),
        (AUDIENCE_DAY_SCHOLARS, 'Day Scholars'),
        (AUDIENCE_BUS_USERS, 'College Bus Users'),
        (AUDIENCE_BUILDING, 'Specific Building'),
    )

    title = models.CharField(max_length=200)
    body = models.TextField()
    notice_type = models.CharField(max_length=16, choices=TYPE_CHOICES, default=TYPE_GENERAL, db_index=True)
    audience = models.CharField(max_length=16, choices=AUDIENCE_CHOICES, default=AUDIENCE_ALL, db_index=True)
    building = models.ForeignKey(
        Building,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notices',
    )
    is_emergency = models.BooleanField(default=False)
    published_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_notices_created',
    )

    class Meta:
        db_table = 'hostel_notice'
        ordering = ('-published_at',)
        verbose_name = 'Hostel Notice'
        verbose_name_plural = 'Hostel Notices'

    @property
    def is_live(self) -> bool:
        now = timezone.now()
        return bool(
            self.is_active
            and self.published_at <= now
            and (self.expires_at is None or self.expires_at >= now)
        )

    def __str__(self):
        return self.title


class HostelNoticeRead(models.Model):
    notice = models.ForeignKey(HostelNotice, on_delete=models.CASCADE, related_name='reads')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hostel_notice_reads',
    )
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'hostel_notice_read'
        verbose_name = 'Hostel Notice Read'
        verbose_name_plural = 'Hostel Notice Reads'
        constraints = [
            models.UniqueConstraint(fields=['notice', 'user'], name='uniq_hostel_notice_read'),
        ]

    def __str__(self):
        return f'{self.notice_id} read by {self.user_id}'


# ---------------------------------------------------------------------------
# Vacating & clearance
# ---------------------------------------------------------------------------


class VacatingRequest(TimeStampedModel):
    STATUS_PENDING = 'PENDING'
    STATUS_ROOM_VERIFIED = 'ROOM_VERIFIED'
    STATUS_ASSETS_VERIFIED = 'ASSETS_VERIFIED'
    STATUS_DUES_CLEARED = 'DUES_CLEARED'
    STATUS_APPROVED = 'APPROVED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_ROOM_VERIFIED, 'Room Verified'),
        (STATUS_ASSETS_VERIFIED, 'Assets Verified'),
        (STATUS_DUES_CLEARED, 'Dues Cleared'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_COMPLETED, 'Completed'),
    )

    student = models.ForeignKey(
        'academics.StudentProfile',
        on_delete=models.CASCADE,
        related_name='hostel_vacating_requests',
    )
    allocation = models.ForeignKey(
        RoomAllocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vacating_requests',
    )
    requested_vacate_date = models.DateField(default=timezone.localdate)
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    room_verified = models.BooleanField(default=False)
    room_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_vacating_room_verified',
    )
    room_verified_at = models.DateTimeField(null=True, blank=True)
    assets_verified = models.BooleanField(default=False)
    assets_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_vacating_assets_verified',
    )
    assets_verified_at = models.DateTimeField(null=True, blank=True)
    dues_cleared = models.BooleanField(default=False)
    dues_cleared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_vacating_dues_cleared',
    )
    dues_cleared_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_vacating_approved',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_vacating_request'
        ordering = ('-created_at',)
        verbose_name = 'Vacating Request'
        verbose_name_plural = 'Vacating Requests'

    def __str__(self):
        return f'{self.student.reg_no} vacate {self.requested_vacate_date} ({self.status})'


class ClearanceRecord(TimeStampedModel):
    TYPE_ROOM = 'ROOM'
    TYPE_ASSET = 'ASSET'
    TYPE_FEE = 'FEE'
    TYPE_LIBRARY = 'LIBRARY'
    TYPE_OTHER = 'OTHER'
    TYPE_CHOICES = (
        (TYPE_ROOM, 'Room'),
        (TYPE_ASSET, 'Asset'),
        (TYPE_FEE, 'Fee / Dues'),
        (TYPE_LIBRARY, 'Library'),
        (TYPE_OTHER, 'Other'),
    )
    STATUS_PENDING = 'PENDING'
    STATUS_CLEARED = 'CLEARED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_CLEARED, 'Cleared'),
        (STATUS_REJECTED, 'Rejected'),
    )

    vacating_request = models.ForeignKey(VacatingRequest, on_delete=models.CASCADE, related_name='clearances')
    clearance_type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    cleared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_clearances_done',
    )
    cleared_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'hostel_clearance_record'
        ordering = ('clearance_type',)
        verbose_name = 'Clearance Record'
        verbose_name_plural = 'Clearance Records'
        constraints = [
            models.UniqueConstraint(
                fields=['vacating_request', 'clearance_type'],
                name='uniq_clearance_type_per_vacating_request',
            ),
        ]

    def __str__(self):
        return f'{self.vacating_request_id}: {self.clearance_type} ({self.status})'


# ---------------------------------------------------------------------------
# Audit & integration logs
# ---------------------------------------------------------------------------


class HostelAuditLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_audit_logs',
    )
    action = models.CharField(max_length=64)
    model_name = models.CharField(max_length=64, blank=True, default='')
    object_id = models.CharField(max_length=64, blank=True, default='')
    object_repr = models.CharField(max_length=255, blank=True, default='')
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'hostel_audit_log'
        ordering = ('-created_at',)
        verbose_name = 'Hostel Audit Log'
        verbose_name_plural = 'Hostel Audit Logs'
        indexes = [models.Index(fields=['action', 'created_at'], name='hostel_audit_action_idx')]

    def __str__(self):
        return f'{self.action} by {self.user_id} at {self.created_at}'


class StudentSyncRun(TimeStampedModel):
    """History of bulk facility-selection imports (CSV / Excel export)."""

    SOURCE_CSV = 'CSV'
    SOURCE_API = 'API'
    SOURCE_MANUAL = 'MANUAL'
    SOURCE_CHOICES = (
        (SOURCE_CSV, 'CSV Upload'),
        (SOURCE_API, 'External API'),
        (SOURCE_MANUAL, 'Manual'),
    )
    STATUS_RUNNING = 'RUNNING'
    STATUS_SUCCESS = 'SUCCESS'
    STATUS_PARTIAL = 'PARTIAL'
    STATUS_FAILED = 'FAILED'
    STATUS_CHOICES = (
        (STATUS_RUNNING, 'Running'),
        (STATUS_SUCCESS, 'Success'),
        (STATUS_PARTIAL, 'Completed with errors'),
        (STATUS_FAILED, 'Failed'),
    )

    source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default=SOURCE_CSV)
    source_name = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_RUNNING, db_index=True)
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    total_rows = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    duplicate_count = models.PositiveIntegerField(default=0)
    message = models.TextField(blank=True, default='')
    errors = models.JSONField(default=list, blank=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hostel_sync_runs',
    )

    class Meta:
        db_table = 'hostel_student_sync_run'
        ordering = ('-started_at',)
        verbose_name = 'Student Sync Run'
        verbose_name_plural = 'Student Sync Runs'

    def __str__(self):
        return f'{self.source} {self.started_at:%Y-%m-%d %H:%M} ({self.status})'
