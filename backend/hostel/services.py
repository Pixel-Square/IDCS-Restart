"""Service layer for the Hostel module.

All mutations that touch allocations, occupancy or approvals live here so the
same rules apply to REST views, admin actions and future management commands.

Concurrency notes
-----------------
Room allocation uses ``select_for_update`` inside a database transaction and
re-counts occupancy from the ``RoomAllocation`` table. Room capacity is never
trusted from a cached column when an allocation is created.
"""

import csv
import io
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Avg, Count, F, Prefetch, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from academics.models import AcademicYear, StudentProfile

from .models import (
    ALLOCATION_ACTIVE,
    FACILITY_STATUS_APPROVED,
    FACILITY_STATUS_NOT_SUBMITTED,
    FACILITY_STATUS_PENDING,
    FACILITY_STATUS_REJECTED,
    HOSTEL_CAT_BOYS,
    HOSTEL_CAT_GIRLS,
    HOSTEL_CAT_MIXED,
    HOSTEL_CAT_STAFF,
    RESIDENCE_CATEGORY_CHOICES,
    RESIDENCE_DAY_SCHOLAR,
    RESIDENCE_HOSTELLER,
    Bed,
    Building,
    CollegeBus,
    Complaint,
    ComplaintStatusHistory,
    FacilityChangeRequest,
    FacilityHistory,
    FeePayment,
    Floor,
    GatePass,
    HostelAuditLog,
    HostelConfiguration,
    HostelNotice,
    HostelNoticeRead,
    MealBooking,
    MessFeedback,
    Room,
    RoomAllocation,
    StudentFacilityProfile,
    StudentFee,
    StudentLeaveRequest,
    StudentSyncRun,
    TransportAssignment,
    TransportRoute,
    TransportStop,
    VacatingRequest,
    Visitor,
)

HOSTEL_PORTAL_DENIED = (
    'The Hostel portal is available only to students who selected '
    'Hosteller as their residence category.'
)


# ---------------------------------------------------------------------------
# Configuration / lookup helpers
# ---------------------------------------------------------------------------


def get_policy() -> HostelConfiguration:
    return HostelConfiguration.get_solo()


def get_active_academic_year():
    return (
        AcademicYear.objects.filter(is_active=True).first()
        or AcademicYear.objects.order_by('-id').first()
    )


def get_selection_window(academic_year=None):
    from .models import FacilitySelectionWindow

    qs = FacilitySelectionWindow.objects.filter(is_active=True)
    if academic_year is not None:
        year_id = getattr(academic_year, 'id', academic_year)
        qs = qs.filter(Q(academic_year_id=year_id) | Q(academic_year__isnull=True))
    return qs.order_by('-opens_at', '-id').first()


def selection_window_state(window=None) -> dict:
    """Human readable state of a facility selection window."""
    if window is None:
        window = get_selection_window(get_active_academic_year())
    if window is None:
        return {
            'open': True,
            'reason': 'NO_WINDOW',
            'message': 'Facility selection is open (no restriction window configured).',
            'opens_at': None,
            'closes_at': None,
        }

    now = timezone.now()
    if not window.is_active:
        return {
            'open': False,
            'reason': 'INACTIVE',
            'message': 'Facility selection is not active.',
            'opens_at': window.opens_at,
            'closes_at': window.closes_at,
        }
    if now < window.opens_at:
        return {
            'open': False,
            'reason': 'NOT_STARTED',
            'message': f'Facility selection opens on {window.opens_at:%d %b %Y %H:%M}.',
            'opens_at': window.opens_at,
            'closes_at': window.closes_at,
        }
    if now > window.closes_at:
        return {
            'open': False,
            'reason': 'CLOSED',
            'message': f'Facility selection closed on {window.closes_at:%d %b %Y %H:%M}.',
            'opens_at': window.opens_at,
            'closes_at': window.closes_at,
        }
    return {
        'open': True,
        'reason': 'OPEN',
        'message': 'Facility selection is open.',
        'opens_at': window.opens_at,
        'closes_at': window.closes_at,
    }


def get_student_profile_for_user(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    return getattr(user, 'student_profile', None)


GENDER_MALE = 'MALE'
GENDER_FEMALE = 'FEMALE'
GENDER_OTHER = 'OTHER'


def normalize_gender(value) -> str:
    """Normalise common gender spellings to MALE / FEMALE / OTHER."""
    text = str(value or '').strip().upper()
    if text in ('M', 'MALE', 'BOY', 'BOYS', 'MAN'):
        return GENDER_MALE
    if text in ('F', 'FEMALE', 'GIRL', 'GIRLS', 'WOMAN'):
        return GENDER_FEMALE
    if text in ('O', 'OTHER', 'NON-BINARY', 'NONBINARY', 'NON BINARY'):
        return GENDER_OTHER
    return ''


def student_gender(student) -> str:
    return normalize_gender(getattr(student, 'gender', ''))


def _apply_student_gender(student, gender, *, overwrite: bool = False):
    """Persist a validated gender on the student master record."""
    normalized = normalize_gender(gender)
    if not normalized:
        raise ValidationError({'gender': 'Gender must be MALE, FEMALE or OTHER.'})
    current = student_gender(student)
    if current and not overwrite:
        return current
    if current != normalized:
        student.gender = normalized
        student.save(update_fields=['gender'])
    return normalized


def set_student_gender(student, gender, *, overwrite: bool = False) -> str:
    """Public helper to capture/repair the gender used by hostel allocation.

    ``overwrite=False`` (the default) never silently changes a gender that is
    already recorded; it simply returns the existing value.
    """
    return _apply_student_gender(student, gender, overwrite=overwrite)


def get_or_create_facility(student, academic_year=None) -> StudentFacilityProfile:
    facility, _ = StudentFacilityProfile.objects.get_or_create(
        student=student,
        defaults={'academic_year': academic_year or get_active_academic_year()},
    )
    if facility.academic_year_id is None and academic_year is not None:
        facility.academic_year = academic_year
        facility.save(update_fields=['academic_year', 'updated_at'])
    return facility


def hostel_access_for_user(user) -> dict:
    """Central gate used by the dashboard flags and student endpoints."""
    student = get_student_profile_for_user(user)
    if student is None:
        return {
            'is_student': False,
            'has_selection': False,
            'is_hosteller': False,
            'is_day_scholar': False,
            'uses_college_bus': False,
            'page_access': False,
            'reason': 'Only students have access to the hostel portal.',
            'allocation_id': None,
            'room_label': '',
        }

    facility = getattr(student, 'hostel_facility', None)
    allocation = (
        RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE)
        .select_related('room', 'room__building', 'room__floor')
        .order_by('-start_date', '-id')
        .first()
    )
    is_hosteller = bool(facility and facility.residence_category == RESIDENCE_HOSTELLER)
    return {
        'is_student': True,
        'has_selection': bool(facility and facility.residence_category),
        'is_hosteller': is_hosteller,
        'is_day_scholar': bool(facility and facility.residence_category == RESIDENCE_DAY_SCHOLAR),
        'uses_college_bus': bool(facility and facility.uses_college_bus),
        'page_access': is_hosteller,
        'reason': '' if is_hosteller else HOSTEL_PORTAL_DENIED,
        'allocation_id': allocation.id if allocation else None,
        'room_label': str(allocation.room) if allocation else '',
    }


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


def record_audit(user, action: str, obj=None, details=None):
    try:
        return HostelAuditLog.objects.create(
            user=user if getattr(user, 'is_authenticated', False) else None,
            action=action,
            model_name=obj.__class__.__name__ if obj is not None else '',
            object_id=str(getattr(obj, 'pk', '') or ''),
            object_repr=str(obj)[:255] if obj is not None else '',
            details=details or {},
        )
    except Exception:
        # Auditing must never break the primary operation.
        return None


# ---------------------------------------------------------------------------
# Facility selection / change requests
# ---------------------------------------------------------------------------


def _validate_category(residence_category, uses_college_bus, day_scholar_address):
    valid = {code for code, _ in RESIDENCE_CATEGORY_CHOICES}
    if residence_category not in valid:
        raise ValidationError(
            {'residence_category': f'Select one of: {", ".join(sorted(valid))}.'}
        )
    if residence_category == RESIDENCE_DAY_SCHOLAR and not day_scholar_address.strip():
        raise ValidationError(
            {'day_scholar_address': 'A residential address is required for Day Scholars.'}
        )
    if residence_category == RESIDENCE_HOSTELLER and uses_college_bus:
        raise ValidationError(
            {'uses_college_bus': 'College Bus cannot be selected for Hostellers. Hostel facilities and bus facilities are mutually exclusive.'}
        )
    if not isinstance(uses_college_bus, bool):
        raise ValidationError({'uses_college_bus': 'Provide a boolean value (true/false).'})


def apply_facility(
    *,
    student,
    residence_category: str,
    uses_college_bus: bool,
    day_scholar_address: str = '',
    emergency_contact_name: str = '',
    emergency_contact_phone: str = '',
    gender: str = '',
    academic_year=None,
    source: str = FacilityHistory.SOURCE_SELF,
    actor=None,
    remarks: str = '',
) -> StudentFacilityProfile:
    """Persist a facility assignment and append to the history trail."""
    _validate_category(residence_category, uses_college_bus, day_scholar_address or '')
    if str(gender or '').strip():
        _apply_student_gender(
            student,
            gender,
            overwrite=source in (FacilityHistory.SOURCE_ADMIN, FacilityHistory.SOURCE_APPROVAL),
        )
    policy = get_policy()
    academic_year = academic_year or get_active_academic_year()
    now = timezone.now()

    with transaction.atomic():
        facility = get_or_create_facility(student, academic_year=academic_year)
        changed = (
            facility.residence_category != residence_category
            or facility.uses_college_bus != bool(uses_college_bus)
        )

        if changed or not facility.residence_category:
            FacilityHistory.objects.filter(student=student, effective_to__isnull=True).update(
                effective_to=timezone.localdate()
            )
            FacilityHistory.objects.create(
                student=student,
                academic_year=academic_year,
                residence_category=residence_category,
                uses_college_bus=bool(uses_college_bus),
                source=source,
                effective_from=timezone.localdate(),
                changed_by=actor if getattr(actor, 'is_authenticated', False) else None,
                remarks=remarks,
            )

        facility.residence_category = residence_category
        facility.uses_college_bus = bool(uses_college_bus)
        facility.day_scholar_address = (day_scholar_address or '').strip()
        facility.emergency_contact_name = (emergency_contact_name or '').strip()
        facility.emergency_contact_phone = (emergency_contact_phone or '').strip()
        facility.academic_year = academic_year
        facility.submitted_at = facility.submitted_at or now
        facility.reviewed_at = now
        facility.reviewed_by = actor if getattr(actor, 'is_authenticated', False) else None
        facility.status = FACILITY_STATUS_APPROVED
        facility.review_remarks = remarks

        if source in (FacilityHistory.SOURCE_ADMIN, FacilityHistory.SOURCE_APPROVAL):
            facility.profile_verified = True
            facility.verified_by = actor if getattr(actor, 'is_authenticated', False) else None
            facility.verified_at = now
        elif policy.profile_verification_required:
            facility.profile_verified = False
            facility.verified_by = None
            facility.verified_at = None

        facility.save()

        # Switching to Day Scholar must not silently free a room unless the
        # institution has explicitly enabled that policy.
        if residence_category == RESIDENCE_DAY_SCHOLAR and policy.release_room_on_category_change:
            for allocation in RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE):
                vacate_allocation(
                    allocation=allocation,
                    vacated_by=actor,
                    reason='Residence category changed to Day Scholar.',
                )

    record_audit(
        actor,
        'FACILITY_ASSIGNED',
        facility,
        {
            'student': student.reg_no,
            'residence_category': residence_category,
            'uses_college_bus': bool(uses_college_bus),
            'source': source,
        },
    )
    return facility


def submit_facility_selection(
    *,
    student,
    residence_category: str,
    uses_college_bus: bool,
    day_scholar_address: str = '',
    emergency_contact_name: str = '',
    emergency_contact_phone: str = '',
    gender: str = '',
    academic_year=None,
    actor=None,
    reason: str = '',
    force: bool = False,
) -> dict:
    """Submit a student's selection.

    Returns a dict with ``applied`` (True when the selection is live) and
    ``requires_approval`` (True when a change request was created instead).
    ``force=True`` is used by administrators and bypasses the window/approval.
    """
    _validate_category(residence_category, uses_college_bus, day_scholar_address or '')
    if str(gender or '').strip():
        # Gender is master data and is safe to capture even while a change
        # request is pending approval.
        _apply_student_gender(student, gender, overwrite=force)
    policy = get_policy()
    academic_year = academic_year or get_active_academic_year()
    facility = get_or_create_facility(student, academic_year=academic_year)
    window = get_selection_window(academic_year)
    has_existing = bool(facility.residence_category)
    now = timezone.now()

    if force:
        updated = apply_facility(
            student=student,
            residence_category=residence_category,
            uses_college_bus=uses_college_bus,
            day_scholar_address=day_scholar_address,
            emergency_contact_name=emergency_contact_name,
            emergency_contact_phone=emergency_contact_phone,
            gender=gender,
            academic_year=academic_year,
            source=FacilityHistory.SOURCE_ADMIN,
            actor=actor,
            remarks=reason,
        )
        return {'applied': True, 'requires_approval': False, 'facility': updated, 'request': None}

    if not has_existing:
        state = selection_window_state(window)
        if not state['open']:
            raise ValidationError({'detail': state['message'], 'code': state['reason']})

    if has_existing:
        needs_approval = (
            not policy.allow_student_edit_after_selection
            or policy.require_approval_for_changes
            or bool(window and window.require_approval)
        )
    else:
        needs_approval = (
            not policy.allow_student_self_selection
            or policy.require_approval_for_selection
            or bool(window and (not window.allow_self_selection or window.require_approval))
        )

    if not needs_approval:
        updated = apply_facility(
            student=student,
            residence_category=residence_category,
            uses_college_bus=uses_college_bus,
            day_scholar_address=day_scholar_address,
            emergency_contact_name=emergency_contact_name,
            emergency_contact_phone=emergency_contact_phone,
            gender=gender,
            academic_year=academic_year,
            source=FacilityHistory.SOURCE_SELF,
            actor=actor,
        )
        return {'applied': True, 'requires_approval': False, 'facility': updated, 'request': None}

    with transaction.atomic():
        FacilityChangeRequest.objects.filter(student=student, status=FacilityChangeRequest.STATUS_PENDING).update(
            status=FacilityChangeRequest.STATUS_CANCELLED,
            reviewed_at=now,
        )
        change_request = FacilityChangeRequest.objects.create(
            student=student,
            academic_year=academic_year,
            previous_category=facility.residence_category,
            requested_category=residence_category,
            previous_uses_college_bus=facility.uses_college_bus,
            requested_uses_college_bus=bool(uses_college_bus),
            day_scholar_address=(day_scholar_address or '').strip(),
            reason=reason,
            requested_by=actor if getattr(actor, 'is_authenticated', False) else None,
        )
        facility.status = FACILITY_STATUS_PENDING
        facility.submitted_at = facility.submitted_at or now
        facility.save(update_fields=['status', 'submitted_at', 'updated_at'])

    record_audit(
        actor,
        'FACILITY_CHANGE_REQUESTED',
        change_request,
        {'student': student.reg_no, 'requested_category': residence_category},
    )
    return {
        'applied': False,
        'requires_approval': True,
        'facility': facility,
        'request': change_request,
    }


def review_facility_request(*, change_request: FacilityChangeRequest, actor, approve: bool, remarks: str = ''):
    if change_request.status != FacilityChangeRequest.STATUS_PENDING:
        raise ValidationError({'detail': 'Only pending requests can be reviewed.'})
    now = timezone.now()

    with transaction.atomic():
        change_request.status = (
            FacilityChangeRequest.STATUS_APPROVED if approve else FacilityChangeRequest.STATUS_REJECTED
        )
        change_request.reviewed_by = actor
        change_request.reviewed_at = now
        change_request.review_remarks = remarks
        change_request.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_remarks', 'updated_at'])

        if approve:
            apply_facility(
                student=change_request.student,
                residence_category=change_request.requested_category,
                uses_college_bus=change_request.requested_uses_college_bus,
                day_scholar_address=change_request.day_scholar_address,
                academic_year=change_request.academic_year,
                source=FacilityHistory.SOURCE_APPROVAL,
                actor=actor,
                remarks=remarks,
            )
        else:
            facility = get_or_create_facility(change_request.student, academic_year=change_request.academic_year)
            if not facility.residence_category:
                facility.status = FACILITY_STATUS_REJECTED
                facility.reviewed_by = actor
                facility.reviewed_at = now
                facility.review_remarks = remarks
                facility.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_remarks', 'updated_at'])

    record_audit(
        actor,
        'FACILITY_REQUEST_APPROVED' if approve else 'FACILITY_REQUEST_REJECTED',
        change_request,
        {'student': change_request.student.reg_no, 'remarks': remarks},
    )
    return change_request


# ---------------------------------------------------------------------------
# Occupancy / allocation
# ---------------------------------------------------------------------------


def recalculate_room_occupancy(room: Room) -> Room:
    """Recompute cached occupancy from active allocations."""
    occupied = RoomAllocation.objects.filter(room=room, status=ALLOCATION_ACTIVE).count()
    if room.status in (Room.STATUS_MAINTENANCE, Room.STATUS_INACTIVE):
        new_status = room.status
    elif room.capacity and occupied >= room.capacity:
        new_status = Room.STATUS_FULL
    elif occupied > 0:
        new_status = Room.STATUS_PARTIALLY_OCCUPIED
    else:
        new_status = Room.STATUS_AVAILABLE

    Room.objects.filter(pk=room.pk).update(occupied_count=occupied, status=new_status)
    room.occupied_count = occupied
    room.status = new_status
    return room


def recalculate_all_rooms() -> int:
    count = 0
    for room in Room.objects.all().only('id', 'capacity', 'status'):
        recalculate_room_occupancy(room)
        count += 1
    return count


def _lock_student(student_id):
    return StudentProfile.objects.select_for_update().get(pk=student_id)


def _assert_room_allocatable(room: Room, student=None):
    if room.status in (Room.STATUS_MAINTENANCE, Room.STATUS_INACTIVE):
        raise ValidationError({'room': f'Room {room.room_number} is not available for allocation ({room.status}).'})
    if room.room_purpose != Room.PURPOSE_HOSTEL:
        raise ValidationError({'room': 'Only rooms with purpose "Hostel" can be allocated to students.'})
    if not room.building.is_hostel:
        raise ValidationError({'room': 'The selected room does not belong to a hostel building.'})
    if not room.floor.is_available_for_allocation or room.floor.status != Floor.STATUS_ACTIVE:
        raise ValidationError({'room': 'The selected floor is not available for allocation.'})
    if (room.capacity or 0) <= 0:
        raise ValidationError({'room': 'Room capacity must be greater than zero before allocating students.'})

    if student is not None:
        _assert_gender_matches_room(student, room)


def _assert_gender_matches_room(student, room: Room):
    """Gender-based allocation is compulsory for hostel rooms.

    * Student gender must be recorded on the student master record.
    * The room (or its building) must have a Boys / Girls / Staff / Mixed category.
    * BOYS rooms accept only MALE students, GIRLS rooms only FEMALE students.
    * STAFF rooms cannot be allocated to students.
    """
    gender = student_gender(student)
    if not gender:
        raise ValidationError(
            {
                'student': 'Gender is required before hostel allocation. '
                           'Update the student profile gender (Male/Female/Other) and try again.'
            }
        )

    category = room.effective_hostel_category or ''
    if not category:
        raise ValidationError(
            {
                'room': (
                    f'Room {room.room_number} has no hostel category. Set the room or building '
                    'category to Boys or Girls before allocating students.'
                )
            }
        )
    if category == HOSTEL_CAT_BOYS and gender != GENDER_MALE:
        raise ValidationError(
            {'room': f'Room {room.room_number} is a Boys hostel room; only male students can be allocated.'}
        )
    if category == HOSTEL_CAT_GIRLS and gender != GENDER_FEMALE:
        raise ValidationError(
            {'room': f'Room {room.room_number} is a Girls hostel room; only female students can be allocated.'}
        )
    if category == HOSTEL_CAT_STAFF:
        raise ValidationError({'room': 'Staff rooms cannot be allocated to students.'})
    if category == HOSTEL_CAT_MIXED:
        # Mixed rooms require an explicitly recorded gender but accept any.
        return


def _validate_bed(room: Room, bed):
    if bed is None:
        return None
    if bed.room_id != room.id:
        raise ValidationError({'bed': 'The selected bed does not belong to the selected room.'})
    if not bed.is_active:
        raise ValidationError({'bed': 'The selected bed is inactive.'})
    if RoomAllocation.objects.filter(bed=bed, status=ALLOCATION_ACTIVE).exists():
        raise ValidationError({'bed': 'That bed is already occupied.'})
    return bed


def _create_allocation(
    *,
    student,
    room: Room,
    bed=None,
    academic_year=None,
    start_date=None,
    expected_end_date=None,
    actor=None,
    remarks='',
):
    _assert_room_allocatable(room, student)
    if RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE).exists():
        raise ValidationError({'student': 'This student already has an active hostel allocation.'})

    occupied = RoomAllocation.objects.filter(room=room, status=ALLOCATION_ACTIVE).count()
    if occupied >= room.capacity:
        raise ValidationError(
            {'room': f'Room {room.room_number} is full ({occupied}/{room.capacity}). Choose another room.'}
        )

    allocation = RoomAllocation.objects.create(
        student=student,
        room=room,
        bed=_validate_bed(room, bed),
        academic_year=academic_year or get_active_academic_year(),
        start_date=start_date or timezone.localdate(),
        expected_end_date=expected_end_date,
        status=ALLOCATION_ACTIVE,
        allocated_by=actor if getattr(actor, 'is_authenticated', False) else None,
        remarks=remarks,
    )
    recalculate_room_occupancy(room)

    # Keep the student's facility profile consistent with the allocation.
    facility = get_or_create_facility(student, academic_year=allocation.academic_year)
    if facility.residence_category != RESIDENCE_HOSTELLER:
        apply_facility(
            student=student,
            residence_category=RESIDENCE_HOSTELLER,
            uses_college_bus=facility.uses_college_bus,
            day_scholar_address=facility.day_scholar_address,
            academic_year=allocation.academic_year,
            source=FacilityHistory.SOURCE_ADMIN,
            actor=actor,
            remarks='Updated automatically by room allocation.',
        )

    record_audit(
        actor,
        'ROOM_ALLOCATED',
        allocation,
        {'student': student.reg_no, 'room': str(room), 'bed': str(bed) if bed else ''},
    )
    return allocation


@transaction.atomic
def allocate_room(*, student, room, bed=None, academic_year=None, start_date=None, expected_end_date=None, actor=None, remarks=''):
    """Allocate a hostel room to a student (transaction-safe)."""
    facility = getattr(student, 'hostel_facility', None)
    if facility is not None and facility.residence_category == RESIDENCE_DAY_SCHOLAR:
        raise ValidationError(
            {'student': 'Day Scholars cannot be allocated hostel facilities. Change the residence category to Hosteller first.'}
        )
    locked_student = _lock_student(getattr(student, 'pk', student))
    locked_facility = getattr(locked_student, 'hostel_facility', None)
    if locked_facility is not None and locked_facility.residence_category == RESIDENCE_DAY_SCHOLAR:
        raise ValidationError(
            {'student': 'Day Scholars cannot be allocated hostel facilities. Change the residence category to Hosteller first.'}
        )
    locked_room = Room.objects.select_for_update().select_related('building', 'floor').get(
        pk=getattr(room, 'pk', room)
    )
    locked_bed = None
    if bed is not None:
        locked_bed = Bed.objects.select_for_update().get(pk=getattr(bed, 'pk', bed))
    return _create_allocation(
        student=locked_student,
        room=locked_room,
        bed=locked_bed,
        academic_year=academic_year,
        start_date=start_date,
        expected_end_date=expected_end_date,
        actor=actor,
        remarks=remarks,
    )


@transaction.atomic
def transfer_allocation(*, allocation, new_room, bed=None, effective_date=None, actor=None, remarks=''):
    """Close the current allocation and move the student to another room."""
    allocation = (
        RoomAllocation.objects.select_for_update()
        .select_related('room', 'student')
        .get(pk=getattr(allocation, 'pk', allocation))
    )
    if allocation.status != ALLOCATION_ACTIVE:
        raise ValidationError({'detail': 'Only active allocations can be transferred.'})

    _lock_student(allocation.student_id)
    old_room = Room.objects.select_for_update().get(pk=allocation.room_id)
    new_room_locked = Room.objects.select_for_update().select_related('building', 'floor').get(
        pk=getattr(new_room, 'pk', new_room)
    )
    if new_room_locked.pk == old_room.pk and bed is None:
        raise ValidationError({'new_room': 'Choose a different room for the transfer.'})

    locked_bed = None
    if bed is not None:
        locked_bed = Bed.objects.select_for_update().get(pk=getattr(bed, 'pk', bed))

    effective_date = effective_date or timezone.localdate()
    allocation.status = RoomAllocation.STATUS_TRANSFERRED
    allocation.end_date = effective_date
    allocation.vacated_by = actor if getattr(actor, 'is_authenticated', False) else None
    allocation.remarks = (allocation.remarks + '\n' if allocation.remarks else '') + (
        f'Transferred to {new_room_locked} on {effective_date}. {remarks}'.strip()
    )
    allocation.save(update_fields=['status', 'end_date', 'vacated_by', 'remarks', 'updated_at'])

    new_allocation = _create_allocation(
        student=allocation.student,
        room=new_room_locked,
        bed=locked_bed,
        academic_year=allocation.academic_year,
        start_date=effective_date,
        actor=actor,
        remarks=remarks,
    )
    recalculate_room_occupancy(old_room)
    record_audit(
        actor,
        'ROOM_TRANSFERRED',
        new_allocation,
        {'student': allocation.student.reg_no, 'from': str(old_room), 'to': str(new_room_locked)},
    )
    return new_allocation


@transaction.atomic
def vacate_allocation(*, allocation, vacated_by=None, reason='', end_date=None):
    allocation = RoomAllocation.objects.select_for_update().select_related('room', 'student').get(
        pk=getattr(allocation, 'pk', allocation)
    )
    if allocation.status != ALLOCATION_ACTIVE:
        raise ValidationError({'detail': 'Only active allocations can be vacated.'})

    room = Room.objects.select_for_update().get(pk=allocation.room_id)
    allocation.status = RoomAllocation.STATUS_VACATED
    allocation.end_date = end_date or timezone.localdate()
    allocation.vacated_by = vacated_by if getattr(vacated_by, 'is_authenticated', False) else None
    if reason:
        allocation.remarks = (allocation.remarks + '\n' if allocation.remarks else '') + reason
    allocation.save(update_fields=['status', 'end_date', 'vacated_by', 'remarks', 'updated_at'])
    recalculate_room_occupancy(room)
    record_audit(
        vacated_by,
        'ROOM_VACATED',
        allocation,
        {'student': allocation.student.reg_no, 'room': str(room), 'reason': reason},
    )
    return allocation


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------


def assign_transport(
    *,
    student,
    route,
    bus=None,
    stop=None,
    boarding_point: str = '',
    academic_year=None,
    actor=None,
    fee_amount=None,
    replace: bool = True,
    remarks: str = '',
):
    academic_year = academic_year or get_active_academic_year()
    route_obj = TransportRoute.objects.get(pk=getattr(route, 'pk', route))
    stop_obj = TransportStop.objects.get(pk=getattr(stop, 'pk', stop)) if stop else None
    bus_obj = CollegeBus.objects.get(pk=getattr(bus, 'pk', bus)) if bus else None

    if stop_obj is not None and stop_obj.route_id != route_obj.id:
        raise ValidationError({'stop': 'The selected stop does not belong to the selected route.'})
    if bus_obj is not None and bus_obj.route_id and bus_obj.route_id != route_obj.id:
        raise ValidationError({'bus': 'The selected bus is assigned to a different route.'})

    if bus_obj is not None and bus_obj.capacity:
        current = TransportAssignment.objects.filter(
            bus=bus_obj, status__in=[TransportAssignment.STATUS_PENDING, TransportAssignment.STATUS_ACTIVE]
        ).exclude(student=student).count()
        if current >= bus_obj.capacity:
            raise ValidationError({'bus': f'Bus {bus_obj.bus_number} is already full ({current}/{bus_obj.capacity}).'})

    with transaction.atomic():
        active_qs = TransportAssignment.objects.select_for_update().filter(
            student=student,
            status__in=[TransportAssignment.STATUS_PENDING, TransportAssignment.STATUS_ACTIVE],
        )
        if active_qs.exists():
            if not replace:
                raise ValidationError({'student': 'This student already has an active transport assignment.'})
            active_qs.update(status=TransportAssignment.STATUS_CANCELLED, end_date=timezone.localdate())

        resolved_fee = fee_amount
        if resolved_fee is None:
            resolved_fee = (
                stop_obj.fee_amount
                if stop_obj is not None and stop_obj.fee_amount is not None
                else route_obj.fee_amount
            )

        assignment = TransportAssignment.objects.create(
            student=student,
            route=route_obj,
            bus=bus_obj,
            stop=stop_obj,
            boarding_point=boarding_point or (stop_obj.name if stop_obj else ''),
            stop_name=stop_obj.name if stop_obj else '',
            fee_amount=resolved_fee or 0,
            academic_year=academic_year,
            status=TransportAssignment.STATUS_ACTIVE,
            assigned_by=actor if getattr(actor, 'is_authenticated', False) else None,
            assigned_at=timezone.now(),
            remarks=remarks,
        )

        facility = get_or_create_facility(student, academic_year=academic_year)
        if not facility.uses_college_bus:
            facility.uses_college_bus = True
            facility.save(update_fields=['uses_college_bus', 'updated_at'])

    record_audit(
        actor,
        'TRANSPORT_ASSIGNED',
        assignment,
        {'student': student.reg_no, 'route': route_obj.code, 'bus': assignment.bus_id and bus_obj.bus_number},
    )
    return assignment


# ---------------------------------------------------------------------------
# Fees
# ---------------------------------------------------------------------------


def record_fee_payment(*, student_fee: StudentFee, amount, actor=None, **payment_fields) -> FeePayment:
    if amount is None or amount <= 0:
        raise ValidationError({'amount': 'Payment amount must be greater than zero.'})
    with transaction.atomic():
        student_fee = StudentFee.objects.select_for_update().get(pk=student_fee.pk)
        payment = FeePayment.objects.create(
            student_fee=student_fee,
            amount=amount,
            recorded_by=actor if getattr(actor, 'is_authenticated', False) else None,
            **payment_fields,
        )
        student_fee.recalculate()
    record_audit(
        actor,
        'FEE_PAYMENT_RECORDED',
        payment,
        {'student': student_fee.student.reg_no, 'amount': str(amount)},
    )
    return payment


# ---------------------------------------------------------------------------
# Complaints
# ---------------------------------------------------------------------------


def update_complaint_status(*, complaint: Complaint, status_value: str, actor=None, note: str = '', resolution_notes: str = ''):
    valid = {code for code, _ in Complaint.STATUS_CHOICES}
    if status_value not in valid:
        raise ValidationError({'status': f'Status must be one of: {", ".join(sorted(valid))}.'})

    with transaction.atomic():
        complaint.status = status_value
        if status_value in (Complaint.STATUS_RESOLVED, Complaint.STATUS_CLOSED):
            complaint.resolved_at = complaint.resolved_at or timezone.now()
            if resolution_notes:
                complaint.resolution_notes = resolution_notes
        elif resolution_notes:
            complaint.resolution_notes = resolution_notes
        complaint.save()
        ComplaintStatusHistory.objects.create(
            complaint=complaint,
            status=status_value,
            note=note,
            changed_by=actor if getattr(actor, 'is_authenticated', False) else None,
        )
    record_audit(actor, 'COMPLAINT_STATUS_UPDATED', complaint, {'status': status_value})
    return complaint


# ---------------------------------------------------------------------------
# Student directory / dashboard
# ---------------------------------------------------------------------------


def _apply_student_filters(qs, params):
    q = (params.get('q') or params.get('search') or '').strip()
    if q:
        qs = qs.filter(
            Q(reg_no__icontains=q)
            | Q(user__first_name__icontains=q)
            | Q(user__last_name__icontains=q)
            | Q(user__username__icontains=q)
            | Q(user__email__icontains=q)
        )

    department = (params.get('department') or '').strip()
    if department:
        if department.isdigit():
            qs = qs.filter(
                Q(home_department_id=int(department))
                | Q(section__batch__course__department_id=int(department))
                | Q(section__batch__department_id=int(department))
            )
        else:
            qs = qs.filter(
                Q(home_department__code__iexact=department)
                | Q(home_department__short_name__iexact=department)
                | Q(section__batch__course__department__code__iexact=department)
                | Q(section__batch__department__code__iexact=department)
            )

    programme = (params.get('programme') or params.get('program') or '').strip()
    if programme:
        if programme.isdigit():
            qs = qs.filter(section__batch__course__program_id=int(programme))
        else:
            qs = qs.filter(section__batch__course__program__name__icontains=programme)

    academic_year = (params.get('academic_year') or params.get('batch') or '').strip()
    if academic_year:
        if academic_year.isdigit():
            qs = qs.filter(
                Q(section__batch__batch_year_id=int(academic_year))
                | Q(section__batch__name__icontains=academic_year)
            )
        else:
            qs = qs.filter(
                Q(section__batch__batch_year__name__icontains=academic_year)
                | Q(section__batch__name__icontains=academic_year)
            )

    residence = (params.get('residence_category') or params.get('residence') or '').strip().upper()
    if residence in ('NONE', 'NOT_SELECTED', 'UNASSIGNED'):
        qs = qs.filter(Q(hostel_facility__isnull=True) | Q(hostel_facility__residence_category=''))
    elif residence in (RESIDENCE_DAY_SCHOLAR, RESIDENCE_HOSTELLER):
        qs = qs.filter(hostel_facility__residence_category=residence)

    gender_filter = normalize_gender(params.get('gender') or params.get('sex') or '')
    if gender_filter:
        qs = qs.filter(gender=gender_filter)

    hostel_category = (params.get('hostel_category') or params.get('hostel_for') or '').strip().upper()
    if hostel_category in (HOSTEL_CAT_BOYS, HOSTEL_CAT_GIRLS, HOSTEL_CAT_STAFF, HOSTEL_CAT_MIXED):
        qs = qs.filter(
            Q(hostel_allocations__room__hostel_category=hostel_category)
            | Q(
                hostel_allocations__room__hostel_category='',
                hostel_allocations__room__building__hostel_category=hostel_category,
            ),
            hostel_allocations__status=ALLOCATION_ACTIVE,
        )

    uses_bus = str(params.get('uses_college_bus') or params.get('bus') or '').strip().lower()
    if uses_bus in ('1', 'true', 'yes', 'y'):
        qs = qs.filter(hostel_facility__uses_college_bus=True)
    elif uses_bus in ('0', 'false', 'no', 'n'):
        qs = qs.filter(Q(hostel_facility__isnull=True) | Q(hostel_facility__uses_college_bus=False))

    status = (params.get('status') or params.get('student_status') or '').strip().upper()
    if status:
        qs = qs.filter(status=status)

    building = (params.get('building') or params.get('hostel') or '').strip()
    if building:
        parts = [part.strip() for part in building.split(',') if part.strip()]
        id_parts = [int(part) for part in parts if part.isdigit()]
        code_parts = [part for part in parts if not part.isdigit()]
        allocation_filter = Q()
        if id_parts:
            allocation_filter |= Q(
                hostel_allocations__room__building_id__in=id_parts,
                hostel_allocations__status=ALLOCATION_ACTIVE,
            )
        if code_parts:
            allocation_filter |= Q(
                hostel_allocations__room__building__code__in=code_parts,
                hostel_allocations__status=ALLOCATION_ACTIVE,
            )
        qs = qs.filter(allocation_filter)

    pending = str(params.get('pending_verification') or '').strip().lower()
    if pending in ('1', 'true', 'yes'):
        qs = qs.filter(hostel_facility__profile_verified=False).exclude(hostel_facility__residence_category='')

    return qs


def build_student_directory_queryset(params=None):
    params = params or {}
    qs = StudentProfile.objects.select_related(
        'user',
        'section',
        'section__batch',
        'section__batch__batch_year',
        'section__batch__course',
        'section__batch__course__department',
        'section__batch__course__program',
        'section__batch__department',
        'home_department',
        'hostel_facility',
    ).prefetch_related(
        Prefetch(
            'hostel_allocations',
            queryset=RoomAllocation.objects.select_related(
                'room', 'room__building', 'room__floor', 'bed'
            ).order_by('-start_date', '-id'),
        ),
    )
    return _apply_student_filters(qs, params).distinct()


def dashboard_summary(params=None) -> dict:
    """All dashboard tiles computed from live database records.

    Hostellers are only counted as occupied beds when they have an ACTIVE
    allocation. Day Scholars and students awaiting allocation are never
    counted as occupants.
    """
    params = dict(params or {})
    students = build_student_directory_queryset(params)

    total_students = students.count()
    active_students = students.filter(status='ACTIVE').count()
    day_scholars = students.filter(hostel_facility__residence_category=RESIDENCE_DAY_SCHOLAR).count()
    hostellers = students.filter(hostel_facility__residence_category=RESIDENCE_HOSTELLER).count()
    male_students = students.filter(gender=GENDER_MALE).count()
    female_students = students.filter(gender=GENDER_FEMALE).count()
    gender_not_set = students.filter(Q(gender='') | Q(gender__isnull=True)).count()
    male_hostellers = students.filter(
        hostel_facility__residence_category=RESIDENCE_HOSTELLER, gender=GENDER_MALE
    ).count()
    female_hostellers = students.filter(
        hostel_facility__residence_category=RESIDENCE_HOSTELLER, gender=GENDER_FEMALE
    ).count()
    bus_users = students.filter(hostel_facility__uses_college_bus=True).count()
    unassigned = students.filter(
        Q(hostel_facility__isnull=True) | Q(hostel_facility__residence_category='')
    ).count()
    pending_verification = (
        students.filter(hostel_facility__profile_verified=False).exclude(hostel_facility__residence_category='').count()
    )
    pending_requests = FacilityChangeRequest.objects.filter(status=FacilityChangeRequest.STATUS_PENDING).count()
    awaiting_allocation = (
        students.filter(hostel_facility__residence_category=RESIDENCE_HOSTELLER)
        .exclude(hostel_allocations__status=ALLOCATION_ACTIVE)
        .count()
    )

    buildings_qs = Building.objects.all()
    floors_qs = Floor.objects.all()
    rooms_qs = Room.objects.all()
    building_filter = (params.get('building') or params.get('hostel') or '').strip()
    if building_filter:
        parts = [part.strip() for part in building_filter.split(',') if part.strip()]
        id_parts = [int(part) for part in parts if part.isdigit()]
        code_parts = [part for part in parts if not part.isdigit()]
        scope_filter = Q()
        if id_parts:
            scope_filter |= Q(pk__in=id_parts)
        if code_parts:
            scope_filter |= Q(code__in=code_parts)
        buildings_qs = buildings_qs.filter(scope_filter)
        floors_qs = floors_qs.filter(building__in=buildings_qs)
        rooms_qs = rooms_qs.filter(building__in=buildings_qs)

    hostel_rooms = rooms_qs.filter(
        room_purpose=Room.PURPOSE_HOSTEL,
        building__building_type=Building.TYPE_HOSTEL,
    )
    hostel_capacity = hostel_rooms.aggregate(total=Sum('capacity'))['total'] or 0
    occupied_beds = RoomAllocation.objects.filter(
        status=ALLOCATION_ACTIVE,
        room__in=hostel_rooms,
    ).count()

    boys_rooms = hostel_rooms.filter(
        Q(hostel_category=HOSTEL_CAT_BOYS)
        | Q(hostel_category='', building__hostel_category=HOSTEL_CAT_BOYS)
    )
    girls_rooms = hostel_rooms.filter(
        Q(hostel_category=HOSTEL_CAT_GIRLS)
        | Q(hostel_category='', building__hostel_category=HOSTEL_CAT_GIRLS)
    )
    boys_beds = int(boys_rooms.aggregate(total=Sum('capacity'))['total'] or 0)
    girls_beds = int(girls_rooms.aggregate(total=Sum('capacity'))['total'] or 0)
    boys_occupied = RoomAllocation.objects.filter(
        status=ALLOCATION_ACTIVE, room__in=boys_rooms
    ).count()
    girls_occupied = RoomAllocation.objects.filter(
        status=ALLOCATION_ACTIVE, room__in=girls_rooms
    ).count()

    by_department = list(
        students.values(
            'home_department__code',
            'home_department__name',
        )
        .annotate(total=Count('id'))
        .order_by('-total')[:20]
    )
    by_building = list(
        hostel_rooms.values(
            'building__id',
            'building__code',
            'building__name',
            'building__hostel_category',
        )
        .annotate(
            rooms=Count('id', distinct=True),
            capacity=Sum('capacity'),
        )
        .order_by('building__name')
    )
    for row in by_building:
        row['occupied'] = RoomAllocation.objects.filter(
            status=ALLOCATION_ACTIVE,
            room__building_id=row['building__id'],
            room__room_purpose=Room.PURPOSE_HOSTEL,
        ).count()

    today = timezone.localdate()
    fee_totals = StudentFee.objects.aggregate(due=Sum('amount_due'), paid=Sum('amount_paid'))
    fee_due = fee_totals['due'] or 0
    fee_paid = fee_totals['paid'] or 0
    open_complaint_statuses = [
        Complaint.STATUS_OPEN,
        Complaint.STATUS_ASSIGNED,
        Complaint.STATUS_IN_PROGRESS,
    ]
    complaint_trend = list(
        Complaint.objects.filter(created_at__date__gte=today - timedelta(days=6))
        .values('created_at__date')
        .annotate(count=Count('id'))
        .order_by('created_at__date')
    )
    complaints = {
        'active': Complaint.objects.filter(status__in=open_complaint_statuses).count(),
        'resolved': Complaint.objects.filter(
            status__in=[Complaint.STATUS_RESOLVED, Complaint.STATUS_CLOSED]
        ).count(),
        'total': Complaint.objects.count(),
        'trend_last_7_days': complaint_trend,
    }
    movement = {
        'visitors_today': Visitor.objects.filter(entry_at__date=today).count(),
        'visitors_inside': Visitor.objects.filter(status=Visitor.STATUS_CHECKED_IN).count(),
        'active_leaves': StudentLeaveRequest.objects.filter(
            status=StudentLeaveRequest.STATUS_APPROVED,
            from_date__lte=today,
            to_date__gte=today,
        ).count(),
        'pending_leaves': StudentLeaveRequest.objects.filter(
            status=StudentLeaveRequest.STATUS_PENDING
        ).count(),
        'active_gate_passes': GatePass.objects.filter(
            status=GatePass.STATUS_APPROVED,
            actual_in_time__isnull=True,
        ).count(),
        'pending_gate_passes': GatePass.objects.filter(status=GatePass.STATUS_PENDING).count(),
        'late_entries': GatePass.objects.filter(is_late_entry=True).count(),
    }
    mess = {
        'booked_today': MealBooking.objects.filter(date=today, is_opted_in=True).count(),
        'opted_out_today': MealBooking.objects.filter(date=today, is_opted_in=False).count(),
        'feedback_average': float(
            MessFeedback.objects.filter(date__gte=today - timedelta(days=30)).aggregate(
                average=Avg('rating')
            )['average']
            or 0
        ),
    }
    finance = {
        'total_due': str(fee_due),
        'total_paid': str(fee_paid),
        'outstanding': str(max(fee_due - fee_paid, 0)),
        'collection_rate': round(float(fee_paid) / float(fee_due) * 100, 2) if fee_due else 0,
        'students_with_dues': StudentFee.objects.filter(amount_due__gt=F('amount_paid')).count(),
    }

    return {
        'students': {
            'total': total_students,
            'active': active_students,
            'day_scholars': day_scholars,
            'hostellers': hostellers,
            'male_students': male_students,
            'female_students': female_students,
            'gender_not_set': gender_not_set,
            'male_hostellers': male_hostellers,
            'female_hostellers': female_hostellers,
            'college_bus_users': bus_users,
            'without_residence_category': unassigned,
            'pending_profile_verification': pending_verification,
            'pending_change_requests': pending_requests,
            'awaiting_hostel_allocation': awaiting_allocation,
        },
        'infrastructure': {
            'buildings': buildings_qs.count(),
            'hostel_buildings': buildings_qs.filter(building_type=Building.TYPE_HOSTEL).count(),
            'floors': floors_qs.count(),
            'rooms': rooms_qs.count(),
            'hostel_rooms': hostel_rooms.count(),
            'configured_hostel_beds': int(hostel_capacity),
            'occupied_beds': occupied_beds,
            'vacant_beds': max(int(hostel_capacity) - occupied_beds, 0),
            'boys_hostel_rooms': boys_rooms.count(),
            'girls_hostel_rooms': girls_rooms.count(),
            'boys_beds': boys_beds,
            'girls_beds': girls_beds,
            'boys_occupied_beds': boys_occupied,
            'girls_occupied_beds': girls_occupied,
            'boys_vacant_beds': max(boys_beds - boys_occupied, 0),
            'girls_vacant_beds': max(girls_beds - girls_occupied, 0),
        },
        'by_department': by_department,
        'by_building': by_building,
        'complaints': complaints,
        'movement': movement,
        'mess': mess,
        'finance': finance,
        'generated_at': timezone.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# Notices for a student
# ---------------------------------------------------------------------------


def notices_for_student(student) -> 'QuerySet':
    facility = getattr(student, 'hostel_facility', None)
    audience = Q(audience=HostelNotice.AUDIENCE_ALL)
    if facility is not None and facility.residence_category == RESIDENCE_HOSTELLER:
        audience |= Q(audience=HostelNotice.AUDIENCE_HOSTELLERS)
    if facility is not None and facility.residence_category == RESIDENCE_DAY_SCHOLAR:
        audience |= Q(audience=HostelNotice.AUDIENCE_DAY_SCHOLARS)
    if facility is not None and facility.uses_college_bus:
        audience |= Q(audience=HostelNotice.AUDIENCE_BUS_USERS)

    allocation = (
        RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE)
        .select_related('room')
        .first()
    )
    if allocation is not None:
        audience |= Q(audience=HostelNotice.AUDIENCE_BUILDING, building_id=allocation.room.building_id)

    section = getattr(student, 'section', None)
    semester = getattr(section, 'semester', None) if section else None
    semester_number = getattr(semester, 'number', None)
    if semester_number:
        study_year = max((int(semester_number) + 1) // 2, 1)
        audience |= Q(audience=HostelNotice.AUDIENCE_YEAR, target_year=study_year)

    now = timezone.now()
    return (
        HostelNotice.objects.filter(audience)
        .filter(is_active=True, published_at__lte=now)
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gte=now))
        .select_related('building', 'created_by')
        .order_by('-is_emergency', '-published_at')
    )


def mark_notice_read(*, notice: HostelNotice, user):
    obj, created = HostelNoticeRead.objects.get_or_create(notice=notice, user=user)
    return obj


# ---------------------------------------------------------------------------
# Vacating / clearance
# ---------------------------------------------------------------------------


def create_vacating_request(*, student, allocation=None, requested_vacate_date=None, reason=''):
    if allocation is None:
        allocation = (
            RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE)
            .select_related('room')
            .first()
        )
    if allocation is None:
        raise ValidationError({'detail': 'No active hostel allocation was found for this student.'})

    existing = VacatingRequest.objects.filter(
        student=student,
        status__in=[
            VacatingRequest.STATUS_PENDING,
            VacatingRequest.STATUS_ROOM_VERIFIED,
            VacatingRequest.STATUS_ASSETS_VERIFIED,
            VacatingRequest.STATUS_DUES_CLEARED,
            VacatingRequest.STATUS_APPROVED,
        ],
    ).exists()
    if existing:
        raise ValidationError({'detail': 'A vacating request is already in progress for this student.'})

    return VacatingRequest.objects.create(
        student=student,
        allocation=allocation,
        requested_vacate_date=requested_vacate_date or timezone.localdate(),
        reason=reason,
    )


def _refresh_vacating_status(request_obj: VacatingRequest):
    if request_obj.status in (VacatingRequest.STATUS_REJECTED, VacatingRequest.STATUS_COMPLETED):
        return request_obj
    if not request_obj.room_verified:
        status_value = VacatingRequest.STATUS_PENDING
    elif not request_obj.assets_verified:
        status_value = VacatingRequest.STATUS_ROOM_VERIFIED
    elif not request_obj.dues_cleared:
        status_value = VacatingRequest.STATUS_ASSETS_VERIFIED
    else:
        status_value = VacatingRequest.STATUS_DUES_CLEARED
    if request_obj.status != status_value:
        request_obj.status = status_value
        request_obj.save(update_fields=['status', 'updated_at'])
    return request_obj


def verify_vacating_step(*, request_obj: VacatingRequest, step: str, actor, approve: bool = True, notes: str = ''):
    step = (step or '').strip().lower()
    if step not in {'room', 'assets', 'dues'}:
        raise ValidationError({'step': 'Step must be one of: room, assets, dues.'})

    now = timezone.now()
    with transaction.atomic():
        request_obj = VacatingRequest.objects.select_for_update().get(pk=request_obj.pk)
        if request_obj.status in (VacatingRequest.STATUS_REJECTED, VacatingRequest.STATUS_COMPLETED):
            raise ValidationError({'detail': 'This vacating request is already closed.'})

        if step == 'room':
            request_obj.room_verified = approve
            request_obj.room_verified_by = actor
            request_obj.room_verified_at = now if approve else None
        elif step == 'assets':
            request_obj.assets_verified = approve
            request_obj.assets_verified_by = actor
            request_obj.assets_verified_at = now if approve else None
        else:
            request_obj.dues_cleared = approve
            request_obj.dues_cleared_by = actor
            request_obj.dues_cleared_at = now if approve else None

        if notes:
            request_obj.remarks = (request_obj.remarks + '\n' if request_obj.remarks else '') + notes
        request_obj.save(
            update_fields=[
                'room_verified',
                'room_verified_by',
                'room_verified_at',
                'assets_verified',
                'assets_verified_by',
                'assets_verified_at',
                'dues_cleared',
                'dues_cleared_by',
                'dues_cleared_at',
                'remarks',
                'updated_at',
            ]
        )
        _refresh_vacating_status(request_obj)

    record_audit(actor, f'VACATING_{step.upper()}_VERIFIED', request_obj, {'approve': approve})
    return request_obj


def approve_vacating_request(*, request_obj: VacatingRequest, actor, approve: bool, remarks: str = ''):
    with transaction.atomic():
        request_obj = VacatingRequest.objects.select_for_update().get(pk=request_obj.pk)
        if request_obj.status == VacatingRequest.STATUS_COMPLETED:
            raise ValidationError({'detail': 'This request is already completed.'})
        now = timezone.now()
        if not approve:
            request_obj.status = VacatingRequest.STATUS_REJECTED
            request_obj.approved_by = actor
            request_obj.approved_at = now
            request_obj.remarks = (request_obj.remarks + '\n' if request_obj.remarks else '') + remarks
            request_obj.save(update_fields=['status', 'approved_by', 'approved_at', 'remarks', 'updated_at'])
            record_audit(actor, 'VACATING_REJECTED', request_obj, {'remarks': remarks})
            return request_obj

        if not (request_obj.room_verified and request_obj.assets_verified and request_obj.dues_cleared):
            raise ValidationError(
                {'detail': 'Room, asset and dues clearance must be completed before final approval.'}
            )

        request_obj.status = VacatingRequest.STATUS_APPROVED
        request_obj.approved_by = actor
        request_obj.approved_at = now
        if remarks:
            request_obj.remarks = (request_obj.remarks + '\n' if request_obj.remarks else '') + remarks
        request_obj.save(update_fields=['status', 'approved_by', 'approved_at', 'remarks', 'updated_at'])

        if request_obj.allocation_id:
            allocation = RoomAllocation.objects.select_for_update().get(pk=request_obj.allocation_id)
            if allocation.status == ALLOCATION_ACTIVE:
                vacate_allocation(
                    allocation=allocation,
                    vacated_by=actor,
                    reason=f'Vacating request {request_obj.pk} approved.',
                    end_date=request_obj.requested_vacate_date,
                )
        request_obj.status = VacatingRequest.STATUS_COMPLETED
        request_obj.save(update_fields=['status', 'updated_at'])

    record_audit(actor, 'VACATING_APPROVED', request_obj, {'remarks': remarks})
    return request_obj


# ---------------------------------------------------------------------------
# CSV import (facility selections)
# ---------------------------------------------------------------------------

_TRUE_VALUES = {'1', 'true', 'yes', 'y', 't'}
_FALSE_VALUES = {'0', 'false', 'no', 'n', 'f', ''}
_HOSTELLER_VALUES = {'hostel', 'hosteller', 'hostel resident', 'boarder', 'h'}
_DAY_SCHOLAR_VALUES = {'day scholar', 'dayscholar', 'day_scholar', 'day-scholar', 'd', 'day'}


def _parse_bool(value, default=False):
    text = str(value or '').strip().lower()
    if text in _TRUE_VALUES:
        return True
    if text in _FALSE_VALUES:
        return False
    raise ValueError(f'Invalid boolean value: {value!r}')


def _parse_category(value):
    text = str(value or '').strip().lower()
    if text in _HOSTELLER_VALUES:
        return RESIDENCE_HOSTELLER
    if text in _DAY_SCHOLAR_VALUES:
        return RESIDENCE_DAY_SCHOLAR
    raise ValueError(f'Invalid residence category: {value!r}')


def _read_csv_text(raw_bytes) -> str:
    for encoding in ('utf-8-sig', 'utf-8', 'cp1252', 'latin-1'):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValidationError({'file': 'Unable to decode the uploaded file. Save it as UTF-8 CSV.'})


def import_facility_selections_csv(*, file_bytes, filename, actor=None, overwrite_verified=False, source=StudentSyncRun.SOURCE_CSV):
    """Import facility selections without touching verified student master data.

    Required column: ``reg_no`` (aliases: roll_no, registration_number, register_no).
    Optional columns: residence_category (required), uses_college_bus,
    day_scholar_address, emergency_contact_name, emergency_contact_phone.
    """
    run = StudentSyncRun.objects.create(
        source=source,
        source_name=filename or '',
        status=StudentSyncRun.STATUS_RUNNING,
        performed_by=actor if getattr(actor, 'is_authenticated', False) else None,
    )
    errors = []
    counts = {'created': 0, 'updated': 0, 'skipped': 0, 'failed': 0, 'duplicates': 0}
    seen = set()
    total = 0

    try:
        text = _read_csv_text(file_bytes)
        reader = csv.DictReader(io.StringIO(text))
        fieldnames = {(name or '').strip().lower() for name in (reader.fieldnames or [])}
        reg_candidates = ['reg_no', 'roll_no', 'registration_number', 'register_no', 'regno']
        reg_key = next((key for key in reg_candidates if key in fieldnames), None)
        category_key = next((k for k in ('residence_category', 'category', 'residence') if k in fieldnames), None)
        if not reg_key or not category_key:
            raise ValidationError(
                {'file': 'CSV must contain a reg_no column and a residence_category column.'}
            )

        for index, raw_row in enumerate(reader, start=2):
            total += 1
            row = {(k or '').strip().lower(): (v or '').strip() for k, v in raw_row.items()}
            reg_no = row.get(reg_key, '')
            try:
                if not reg_no:
                    raise ValueError('Missing reg_no.')
                key = reg_no.upper()
                if key in seen:
                    counts['duplicates'] += 1
                    counts['skipped'] += 1
                    errors.append({'row': index, 'reg_no': reg_no, 'error': 'Duplicate reg_no in file.'})
                    continue
                seen.add(key)

                student = StudentProfile.objects.filter(reg_no__iexact=reg_no).first()
                if student is None:
                    raise ValueError('Student not found in the student master data.')

                category = _parse_category(row.get(category_key))
                uses_bus = _parse_bool(row.get('uses_college_bus') or row.get('college_bus') or row.get('bus'))
                address = row.get('day_scholar_address') or row.get('address') or ''

                facility = get_or_create_facility(student, academic_year=get_active_academic_year())
                if (
                    facility.residence_category
                    and facility.status == FACILITY_STATUS_APPROVED
                    and facility.profile_verified
                    and not overwrite_verified
                ):
                    counts['skipped'] += 1
                    errors.append(
                        {
                            'row': index,
                            'reg_no': reg_no,
                            'error': 'Verified selection exists. Re-run with overwrite_verified=true to update.',
                        }
                    )
                    continue

                existed = bool(facility.residence_category)
                apply_facility(
                    student=student,
                    residence_category=category,
                    uses_college_bus=uses_bus,
                    day_scholar_address=address,
                    emergency_contact_name=row.get('emergency_contact_name', ''),
                    emergency_contact_phone=row.get('emergency_contact_phone', ''),
                    gender=row.get('gender') or row.get('sex') or '',
                    academic_year=facility.academic_year or get_active_academic_year(),
                    source=FacilityHistory.SOURCE_IMPORT,
                    actor=actor,
                    remarks=f'Imported from {filename or "CSV upload"}.',
                )
                counts['updated' if existed else 'created'] += 1
            except Exception as exc:  # noqa: BLE001 - report per-row errors, continue importing
                counts['failed'] += 1
                errors.append({'row': index, 'reg_no': reg_no, 'error': str(exc)})

    except ValidationError:
        run.status = StudentSyncRun.STATUS_FAILED
        run.finished_at = timezone.now()
        run.total_rows = total
        run.failed_count = counts['failed'] + 1
        run.message = 'Import failed due to an invalid file.'
        run.errors = [{'error': 'Invalid CSV file or missing required columns.'}]
        run.save()
        raise
    except Exception as exc:  # noqa: BLE001
        run.status = StudentSyncRun.STATUS_FAILED
        run.finished_at = timezone.now()
        run.total_rows = total
        run.message = f'Import failed: {exc}'
        run.errors = errors[:500]
        run.save()
        raise ValidationError({'file': f'Could not process the uploaded file: {exc}'})

    run.finished_at = timezone.now()
    run.total_rows = total
    run.created_count = counts['created']
    run.updated_count = counts['updated']
    run.skipped_count = counts['skipped']
    run.failed_count = counts['failed']
    run.duplicate_count = counts['duplicates']
    run.errors = errors[:500]
    if counts['failed'] or counts['skipped']:
        run.status = StudentSyncRun.STATUS_PARTIAL
        run.message = 'Import completed with some skipped or failed rows.'
    else:
        run.status = StudentSyncRun.STATUS_SUCCESS
        run.message = 'Import completed successfully.'
    run.save()

    record_audit(actor, 'FACILITY_CSV_IMPORTED', run, counts)
    return run


__all__ = [
    'allocate_room',
    'apply_facility',
    'approve_vacating_request',
    'assign_transport',
    'build_student_directory_queryset',
    'create_vacating_request',
    'dashboard_summary',
    'get_active_academic_year',
    'get_or_create_facility',
    'get_policy',
    'get_selection_window',
    'hostel_access_for_user',
    'import_facility_selections_csv',
    'mark_notice_read',
    'notices_for_student',
    'recalculate_all_rooms',
    'recalculate_room_occupancy',
    'record_audit',
    'record_fee_payment',
    'review_facility_request',
    'selection_window_state',
    'submit_facility_selection',
    'transfer_allocation',
    'update_complaint_status',
    'vacate_allocation',
    'verify_vacating_step',
]
