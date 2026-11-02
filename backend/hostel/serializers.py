"""Serializers for the Hostel module."""

from django.utils import timezone
from rest_framework import serializers

from .models import (
    Asset,
    AssetMaintenanceLog,
    Bed,
    Building,
    ClearanceRecord,
    CollegeBus,
    Complaint,
    ComplaintStatusHistory,
    FacilityChangeRequest,
    FacilityHistory,
    FeePayment,
    FeeStructure,
    Floor,
    GatePass,
    HostelAuditLog,
    HostelConfiguration,
    HostelNotice,
    HostelWardenAssignment,
    LateEntry,
    MealBooking,
    MessFeedback,
    MessMenu,
    MessPreference,
    MessRequest,
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
    FacilitySelectionWindow,
)


# ---------------------------------------------------------------------------
# Student helpers
# ---------------------------------------------------------------------------


def student_display_name(student) -> str:
    user = getattr(student, 'user', None)
    if user is None:
        return student.reg_no
    first = str(getattr(user, 'first_name', '') or '').strip()
    last = str(getattr(user, 'last_name', '') or '').strip()
    full = f'{first} {last}'.strip()
    return full or str(getattr(user, 'username', '') or student.reg_no)


def student_department(student):
    dept = getattr(student, 'home_department', None)
    if dept is not None:
        return dept
    section = getattr(student, 'section', None)
    batch = getattr(section, 'batch', None) if section else None
    if batch is not None:
        course = getattr(batch, 'course', None)
        if course is not None:
            return getattr(course, 'department', None)
        return getattr(batch, 'department', None)
    return None


class StudentBriefSerializer(serializers.Serializer):
    """Lightweight student representation used across hostel endpoints."""

    id = serializers.IntegerField(read_only=True)
    reg_no = serializers.CharField(read_only=True)
    roll_number = serializers.CharField(source='reg_no', read_only=True)
    name = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    mobile_number = serializers.CharField(read_only=True)
    department = serializers.SerializerMethodField()
    programme = serializers.SerializerMethodField()
    semester = serializers.SerializerMethodField()
    section = serializers.SerializerMethodField()
    batch = serializers.SerializerMethodField()
    academic_year = serializers.SerializerMethodField()
    student_status = serializers.CharField(source='status', read_only=True)
    gender = serializers.CharField(read_only=True)
    photograph = serializers.SerializerMethodField()
    residence_category = serializers.SerializerMethodField()
    uses_college_bus = serializers.SerializerMethodField()
    facility_status = serializers.SerializerMethodField()
    hostel = serializers.SerializerMethodField()

    def get_name(self, obj):
        return student_display_name(obj)

    def get_email(self, obj):
        return str(getattr(getattr(obj, 'user', None), 'email', '') or '')

    def get_department(self, obj):
        dept = student_department(obj)
        if dept is None:
            return None
        return {'id': dept.id, 'code': dept.code, 'name': dept.name, 'short_name': dept.short_name}

    def get_programme(self, obj):
        section = getattr(obj, 'section', None)
        batch = getattr(section, 'batch', None) if section else None
        course = getattr(batch, 'course', None) if batch else None
        program = getattr(course, 'program', None) if course else None
        if program is None:
            return ''
        return program.name

    def get_semester(self, obj):
        section = getattr(obj, 'section', None)
        semester = getattr(section, 'semester', None) if section else None
        return semester.number if semester is not None else None

    def get_section(self, obj):
        section = getattr(obj, 'section', None)
        return section.name if section is not None else ''

    def get_batch(self, obj):
        section = getattr(obj, 'section', None)
        batch = getattr(section, 'batch', None) if section else None
        return batch.name if batch is not None else ''

    def get_academic_year(self, obj):
        section = getattr(obj, 'section', None)
        batch = getattr(section, 'batch', None) if section else None
        batch_year = getattr(batch, 'batch_year', None) if batch else None
        return batch_year.name if batch_year is not None else self.get_batch(obj)

    def get_photograph(self, obj):
        image = getattr(obj, 'profile_image', None)
        if not image:
            return ''
        try:
            return image.url
        except Exception:
            return ''

    def get_residence_category(self, obj):
        facility = getattr(obj, 'hostel_facility', None)
        return facility.residence_category if facility is not None else ''

    def get_uses_college_bus(self, obj):
        facility = getattr(obj, 'hostel_facility', None)
        return bool(facility.uses_college_bus) if facility is not None else False

    def get_facility_status(self, obj):
        facility = getattr(obj, 'hostel_facility', None)
        return facility.status if facility is not None else 'NOT_SUBMITTED'

    def get_hostel(self, obj):
        allocation = None
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('hostel_allocations')
        if prefetched is not None:
            active = [a for a in prefetched if a.status == RoomAllocation.STATUS_ACTIVE]
            allocation = active[0] if active else None
        if allocation is None:
            allocation = (
                RoomAllocation.objects.filter(student=obj, status=RoomAllocation.STATUS_ACTIVE)
                .select_related('room', 'room__building', 'room__floor')
                .first()
            )
        if allocation is None:
            return None
        return {
            'allocation_id': allocation.id,
            'building': allocation.room.building.name,
            'building_code': allocation.room.building.code,
            'floor': allocation.room.floor.floor_number,
            'room_number': allocation.room.room_number,
            'bed': allocation.bed.bed_number if allocation.bed_id else '',
            'hostel_category': allocation.room.effective_hostel_category,
            'start_date': allocation.start_date,
        }


# ---------------------------------------------------------------------------
# Configuration / facility
# ---------------------------------------------------------------------------


class HostelConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = HostelConfiguration
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'updated_by')


class FacilitySelectionWindowSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.SerializerMethodField()
    is_open_now = serializers.BooleanField(read_only=True)

    class Meta:
        model = FacilitySelectionWindow
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_academic_year_name(self, obj):
        return str(obj.academic_year) if obj.academic_year_id else ''

    def validate(self, attrs):
        opens_at = attrs.get('opens_at', getattr(self.instance, 'opens_at', None))
        closes_at = attrs.get('closes_at', getattr(self.instance, 'closes_at', None))
        if opens_at and closes_at and closes_at <= opens_at:
            raise serializers.ValidationError({'closes_at': 'Closing time must be after opening time.'})
        return attrs


class StudentFacilityProfileSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    is_hosteller = serializers.BooleanField(read_only=True)
    is_day_scholar = serializers.BooleanField(read_only=True)

    class Meta:
        model = StudentFacilityProfile
        fields = '__all__'
        read_only_fields = (
            'created_at',
            'updated_at',
            'submitted_at',
            'reviewed_by',
            'reviewed_at',
            'verified_by',
            'verified_at',
            'status',
        )


class FacilityFacilitySelectionSerializer(serializers.Serializer):
    """Input serializer for ``POST /api/hostel/me/facility/``."""

    residence_category = serializers.ChoiceField(choices=['DAY_SCHOLAR', 'HOSTELLER'])
    uses_college_bus = serializers.BooleanField(required=False, default=False)
    day_scholar_address = serializers.CharField(required=False, allow_blank=True, default='')
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True, default='')
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True, default='')
    gender = serializers.CharField(required=False, allow_blank=True, default='')
    academic_year = serializers.IntegerField(required=False, allow_null=True, default=None)
    reason = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs.get('residence_category') == 'DAY_SCHOLAR' and not attrs.get('day_scholar_address', '').strip():
            raise serializers.ValidationError(
                {'day_scholar_address': 'A residential address is required for Day Scholars.'}
            )
        return attrs


class FacilityChangeRequestSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FacilityChangeRequest
        fields = '__all__'
        read_only_fields = (
            'previous_category',
            'previous_uses_college_bus',
            'status',
            'requested_by',
            'reviewed_by',
            'reviewed_at',
            'review_remarks',
            'created_at',
            'updated_at',
        )

    def get_requested_by_name(self, obj):
        return str(obj.requested_by) if obj.requested_by_id else ''

    def get_reviewed_by_name(self, obj):
        return str(obj.reviewed_by) if obj.reviewed_by_id else ''


class FacilityHistorySerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)

    class Meta:
        model = FacilityHistory
        fields = '__all__'


# ---------------------------------------------------------------------------
# Infrastructure
# ---------------------------------------------------------------------------


class HostelWardenAssignmentSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    building_code = serializers.CharField(source='building.code', read_only=True)

    class Meta:
        model = HostelWardenAssignment
        fields = '__all__'

    def get_user_name(self, obj):
        return str(obj.user)


class BuildingSerializer(serializers.ModelSerializer):
    actual_floor_count = serializers.SerializerMethodField()
    rooms_count = serializers.SerializerMethodField()
    total_room_capacity = serializers.SerializerMethodField()
    occupied_beds = serializers.SerializerMethodField()
    available_capacity = serializers.SerializerMethodField()
    warden_assignments = HostelWardenAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Building
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_actual_floor_count(self, obj):
        annotated = getattr(obj, 'actual_floor_count', None)
        return annotated if annotated is not None else obj.floors.count()

    def get_rooms_count(self, obj):
        annotated = getattr(obj, 'rooms_count', None)
        return annotated if annotated is not None else obj.rooms.count()

    def get_total_room_capacity(self, obj):
        annotated = getattr(obj, 'total_room_capacity', None)
        if annotated is not None:
            return int(annotated or 0)
        from django.db.models import Sum

        return int(obj.rooms.aggregate(total=Sum('capacity'))['total'] or 0)

    def get_occupied_beds(self, obj):
        annotated = getattr(obj, 'occupied_beds', None)
        if annotated is not None:
            return int(annotated or 0)
        return RoomAllocation.objects.filter(
            room__building=obj, status=RoomAllocation.STATUS_ACTIVE
        ).count()

    def get_available_capacity(self, obj):
        return max(self.get_total_room_capacity(obj) - self.get_occupied_beds(obj), 0)


class FloorSerializer(serializers.ModelSerializer):
    building_code = serializers.CharField(source='building.code', read_only=True)
    building_name = serializers.CharField(source='building.name', read_only=True)
    rooms_count = serializers.SerializerMethodField()
    total_capacity = serializers.SerializerMethodField()
    occupied_count = serializers.SerializerMethodField()
    available_capacity = serializers.SerializerMethodField()

    class Meta:
        model = Floor
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def validate(self, attrs):
        building = attrs.get('building', getattr(self.instance, 'building', None))
        floor_number = attrs.get('floor_number', getattr(self.instance, 'floor_number', None))
        if building and floor_number is not None:
            qs = Floor.objects.filter(building=building, floor_number=floor_number)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {'floor_number': f'Floor {floor_number} is already configured for this building.'}
                )
        return attrs

    def get_rooms_count(self, obj):
        annotated = getattr(obj, 'rooms_count', None)
        return annotated if annotated is not None else obj.rooms.count()

    def get_total_capacity(self, obj):
        annotated = getattr(obj, 'total_capacity', None)
        if annotated is not None:
            return int(annotated or 0)
        from django.db.models import Sum

        return int(obj.rooms.aggregate(total=Sum('capacity'))['total'] or 0)

    def get_occupied_count(self, obj):
        annotated = getattr(obj, 'occupied_count', None)
        if annotated is not None:
            return int(annotated or 0)
        return RoomAllocation.objects.filter(room__floor=obj, status=RoomAllocation.STATUS_ACTIVE).count()

    def get_available_capacity(self, obj):
        return max(self.get_total_capacity(obj) - self.get_occupied_count(obj), 0)


class BedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bed
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


class RoomSerializer(serializers.ModelSerializer):
    building_code = serializers.CharField(source='building.code', read_only=True)
    building_name = serializers.CharField(source='building.name', read_only=True)
    building_hostel_category = serializers.CharField(source='building.hostel_category', read_only=True)
    floor_number = serializers.IntegerField(source='floor.floor_number', read_only=True)
    floor_name = serializers.CharField(source='floor.name', read_only=True)
    available_capacity = serializers.IntegerField(read_only=True)
    effective_hostel_category = serializers.CharField(read_only=True)
    beds = BedSerializer(many=True, read_only=True)

    class Meta:
        model = Room
        fields = '__all__'
        read_only_fields = ('occupied_count', 'status', 'created_at', 'updated_at')

    def validate(self, attrs):
        building = attrs.get('building', getattr(self.instance, 'building', None))
        floor = attrs.get('floor', getattr(self.instance, 'floor', None))
        capacity = attrs.get('capacity', getattr(self.instance, 'capacity', 0))
        bed_count = attrs.get('bed_count', getattr(self.instance, 'bed_count', None))
        purpose = attrs.get('room_purpose', getattr(self.instance, 'room_purpose', None))
        room_number = attrs.get('room_number', getattr(self.instance, 'room_number', None))
        if building and floor and floor.building_id != building.id:
            raise serializers.ValidationError({'floor': 'The selected floor does not belong to this building.'})
        if building and room_number:
            duplicate = Room.objects.filter(building=building, room_number=room_number)
            if self.instance is not None:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError(
                    {'room_number': f'Room {room_number} already exists in this building.'}
                )
        if bed_count is not None and capacity is not None and bed_count > capacity:
            raise serializers.ValidationError({'bed_count': 'Bed count cannot exceed room capacity.'})
        if self.instance is not None:
            active = RoomAllocation.objects.filter(
                room_id=self.instance.pk, status=RoomAllocation.STATUS_ACTIVE
            ).count()
            if capacity is not None and capacity < active:
                raise serializers.ValidationError(
                    {'capacity': f'Capacity cannot be lower than the {active} active occupant(s).'}
                )
            if active and purpose and purpose != Room.PURPOSE_HOSTEL:
                raise serializers.ValidationError(
                    {'room_purpose': 'Cannot change the purpose of a room with active allocations.'}
                )
        return attrs


class RoomAllocationSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    room_label = serializers.SerializerMethodField()
    building_name = serializers.CharField(source='room.building.name', read_only=True)
    building_code = serializers.CharField(source='room.building.code', read_only=True)
    floor_number = serializers.IntegerField(source='room.floor.floor_number', read_only=True)
    room_number = serializers.CharField(source='room.room_number', read_only=True)
    bed_number = serializers.CharField(source='bed.bed_number', read_only=True, default='')

    class Meta:
        model = RoomAllocation
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_room_label(self, obj):
        return str(obj.room)


class TransferAllocationSerializer(serializers.Serializer):
    new_room = serializers.IntegerField()
    bed = serializers.IntegerField(required=False, allow_null=True, default=None)
    effective_date = serializers.DateField(required=False, allow_null=True, default=None)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


class RoomAllocationCreateSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    room = serializers.IntegerField()
    bed = serializers.IntegerField(required=False, allow_null=True, default=None)
    academic_year = serializers.IntegerField(required=False, allow_null=True, default=None)
    start_date = serializers.DateField(required=False, allow_null=True, default=None)
    expected_end_date = serializers.DateField(required=False, allow_null=True, default=None)
    gender = serializers.CharField(required=False, allow_blank=True, default='')
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------


class TransportStopSerializer(serializers.ModelSerializer):
    route_code = serializers.CharField(source='route.code', read_only=True)

    class Meta:
        model = TransportStop
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


class TransportRouteSerializer(serializers.ModelSerializer):
    stops = TransportStopSerializer(many=True, read_only=True)
    bus_count = serializers.SerializerMethodField()
    assigned_students = serializers.SerializerMethodField()

    class Meta:
        model = TransportRoute
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_bus_count(self, obj):
        annotated = getattr(obj, 'bus_count', None)
        return annotated if annotated is not None else obj.buses.count()

    def get_assigned_students(self, obj):
        annotated = getattr(obj, 'assigned_students', None)
        if annotated is not None:
            return annotated
        return obj.assignments.filter(status__in=['PENDING', 'ACTIVE']).count()


class CollegeBusSerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source='route.name', read_only=True, default='')
    route_code = serializers.CharField(source='route.code', read_only=True, default='')
    assigned_students = serializers.SerializerMethodField()

    class Meta:
        model = CollegeBus
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_assigned_students(self, obj):
        annotated = getattr(obj, 'assigned_students', None)
        if annotated is not None:
            return annotated
        return obj.assignments.filter(status__in=['PENDING', 'ACTIVE']).count()


class TransportAssignmentSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)
    route_code = serializers.CharField(source='route.code', read_only=True)
    bus_number = serializers.CharField(source='bus.bus_number', read_only=True, default='')
    stop_name_display = serializers.CharField(source='stop.name', read_only=True, default='')

    class Meta:
        model = TransportAssignment
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'assigned_by', 'assigned_at')


class TransportAssignmentCreateSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    route = serializers.IntegerField()
    bus = serializers.IntegerField(required=False, allow_null=True, default=None)
    stop = serializers.IntegerField(required=False, allow_null=True, default=None)
    boarding_point = serializers.CharField(required=False, allow_blank=True, default='')
    academic_year = serializers.IntegerField(required=False, allow_null=True, default=None)
    fee_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, default=None
    )
    replace = serializers.BooleanField(required=False, default=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


# ---------------------------------------------------------------------------
# Fees
# ---------------------------------------------------------------------------


class FeeStructureSerializer(serializers.ModelSerializer):
    building_name = serializers.CharField(source='building.name', read_only=True, default='')
    route_name = serializers.CharField(source='route.name', read_only=True, default='')
    academic_year_name = serializers.SerializerMethodField()

    class Meta:
        model = FeeStructure
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_academic_year_name(self, obj):
        return str(obj.academic_year) if obj.academic_year_id else ''


class FeePaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_reg_no = serializers.CharField(source='student_fee.student.reg_no', read_only=True)

    class Meta:
        model = FeePayment
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'receipt_number', 'recorded_by')

    def get_student_name(self, obj):
        return student_display_name(obj.student_fee.student)


class StudentFeeSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    fee_structure_name = serializers.CharField(source='fee_structure.name', read_only=True)
    fee_type = serializers.CharField(source='fee_structure.fee_type', read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    payments = FeePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = StudentFee
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'amount_paid', 'status')


class StudentFeeCreateSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    fee_structure = serializers.IntegerField()
    academic_year = serializers.IntegerField(required=False, allow_null=True, default=None)
    amount_due = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, default=None)
    due_date = serializers.DateField(required=False, allow_null=True, default=None)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


class FeePaymentCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    paid_on = serializers.DateField(required=False, allow_null=True, default=None)
    method = serializers.ChoiceField(
        choices=['CASH', 'UPI', 'CARD', 'NEFT', 'CHEQUE', 'OTHER'], required=False, default='CASH'
    )
    reference_no = serializers.CharField(required=False, allow_blank=True, default='')
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


# ---------------------------------------------------------------------------
# Complaints
# ---------------------------------------------------------------------------


class ComplaintStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ComplaintStatusHistory
        fields = '__all__'

    def get_changed_by_name(self, obj):
        return str(obj.changed_by) if obj.changed_by_id else ''


class ComplaintSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    building_name = serializers.CharField(source='building.name', read_only=True, default='')
    room_number = serializers.CharField(source='room.room_number', read_only=True, default='')
    assigned_to_name = serializers.SerializerMethodField()
    history = ComplaintStatusHistorySerializer(many=True, read_only=True)

    class Meta:
        model = Complaint
        fields = '__all__'
        read_only_fields = ('ticket_no', 'created_at', 'updated_at', 'resolved_at')

    def get_assigned_to_name(self, obj):
        return str(obj.assigned_to) if obj.assigned_to_id else ''


class ComplaintStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[code for code, _ in Complaint.STATUS_CHOICES])
    note = serializers.CharField(required=False, allow_blank=True, default='')
    resolution_notes = serializers.CharField(required=False, allow_blank=True, default='')


# ---------------------------------------------------------------------------
# Mess
# ---------------------------------------------------------------------------


class MessMenuSerializer(serializers.ModelSerializer):
    building_name = serializers.CharField(source='building.name', read_only=True, default='')
    day_of_week_display = serializers.CharField(source='get_day_of_week_display', read_only=True)
    meal_type_display = serializers.CharField(source='get_meal_type_display', read_only=True)

    class Meta:
        model = MessMenu
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by')

    def validate(self, attrs):
        menu_items = attrs.get('menu_items')
        items = attrs.get('items')
        if not items and not menu_items:
            raise serializers.ValidationError({'items': 'Provide at least one menu item.'})
        if menu_items and items:
            attrs['menu_items'] = [
                str(item).strip() for item in menu_items if str(item).strip()
            ]
            attrs['items'] = ', '.join(attrs['menu_items'])
        return attrs


class MealBookingSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    meal_type_display = serializers.CharField(source='get_meal_type_display', read_only=True)

    class Meta:
        model = MealBooking
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def validate(self, attrs):
        student = attrs.get('student', getattr(self.instance, 'student', None))
        date = attrs.get('date', getattr(self.instance, 'date', None))
        meal_type = attrs.get('meal_type', getattr(self.instance, 'meal_type', None))
        if student and date and meal_type:
            duplicate = MealBooking.objects.filter(
                student=student, date=date, meal_type=meal_type
            ).exclude(pk=getattr(self.instance, 'pk', None))
            if duplicate.exists():
                raise serializers.ValidationError({'meal_type': 'A booking already exists for this meal.'})
        return attrs


class MessPreferenceSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)

    class Meta:
        model = MessPreference
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


class MessFeedbackSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)

    class Meta:
        model = MessFeedback
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


class MessRequestSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MessRequest
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'reviewed_by', 'reviewed_at', 'status')

    def get_reviewed_by_name(self, obj):
        return str(obj.reviewed_by) if obj.reviewed_by_id else ''


# ---------------------------------------------------------------------------
# Visitors / movement
# ---------------------------------------------------------------------------


class VisitorSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    building_name = serializers.CharField(source='building.name', read_only=True, default='')
    room_number = serializers.CharField(source='room.room_number', read_only=True, default='')
    logged_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Visitor
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_logged_by_name(self, obj):
        return str(obj.logged_by) if obj.logged_by_id else ''


class StudentLeaveRequestSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)

    class Meta:
        model = StudentLeaveRequest
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'approved_by', 'approved_at', 'status')

    def validate(self, attrs):
        from_date = attrs.get('from_date', getattr(self.instance, 'from_date', None))
        to_date = attrs.get('to_date', getattr(self.instance, 'to_date', None))
        if from_date and to_date and to_date < from_date:
            raise serializers.ValidationError({'to_date': 'To date cannot be before the from date.'})
        return attrs


class LateEntrySerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)

    class Meta:
        model = LateEntry
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'approved_by', 'status')


class GatePassSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    approved_by_name = serializers.SerializerMethodField()
    security_guard_out_name = serializers.SerializerMethodField()
    security_guard_in_name = serializers.SerializerMethodField()
    pass_type_display = serializers.CharField(source='get_pass_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_valid_at_gate = serializers.BooleanField(read_only=True)
    is_late_entry = serializers.BooleanField(read_only=True)
    qr_payload = serializers.CharField(read_only=True)
    qr_image = serializers.SerializerMethodField()

    class Meta:
        model = GatePass
        fields = '__all__'
        read_only_fields = (
            'created_at',
            'updated_at',
            'status',
            'approved_by',
            'approved_at',
            'actual_out_time',
            'actual_in_time',
            'security_guard_out',
            'security_guard_in',
            'is_late_entry',
            'qr_token',
        )

    def get_approved_by_name(self, obj):
        return str(obj.approved_by) if obj.approved_by_id else ''

    def get_security_guard_out_name(self, obj):
        return str(obj.security_guard_out) if obj.security_guard_out_id else ''

    def get_security_guard_in_name(self, obj):
        return str(obj.security_guard_in) if obj.security_guard_in_id else ''

    def get_qr_image(self, obj):
        return obj.qr_image_data_uri()

    def validate(self, attrs):
        from_date = attrs.get('from_date', getattr(self.instance, 'from_date', None))
        to_date = attrs.get('to_date', getattr(self.instance, 'to_date', None))
        expected_out = attrs.get('expected_out_time', getattr(self.instance, 'expected_out_time', None))
        expected_in = attrs.get('expected_in_time', getattr(self.instance, 'expected_in_time', None))
        if from_date and to_date and to_date < from_date:
            raise serializers.ValidationError({'to_date': 'To date cannot be before the from date.'})
        if expected_out and expected_in and expected_in <= expected_out:
            raise serializers.ValidationError({'expected_in_time': 'Expected in time must be after the out time.'})
        return attrs


class AnnouncementSerializer(serializers.ModelSerializer):
    message = serializers.CharField(source='body')
    target_audience = serializers.CharField(source='audience', required=False)
    priority = serializers.ChoiceField(choices=HostelNotice.PRIORITY_CHOICES, required=False, default=HostelNotice.PRIORITY_NORMAL)
    building_name = serializers.CharField(source='building.name', read_only=True, default='')
    created_by_name = serializers.SerializerMethodField()
    read_count = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = HostelNotice
        fields = (
            'id',
            'title',
            'message',
            'priority',
            'target_audience',
            'notice_type',
            'building',
            'building_name',
            'target_year',
            'created_by',
            'created_by_name',
            'published_at',
            'expires_at',
            'is_active',
            'is_read',
            'read_count',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at', 'created_by', 'published_at')

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by_id else ''

    def get_read_count(self, obj):
        return obj.reads.count() if hasattr(obj, 'reads') else 0

    def get_is_read(self, obj):
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            return False
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('reads')
        if prefetched is not None:
            return any(row.user_id == request.user.id for row in prefetched)
        return obj.reads.filter(user_id=request.user.id).exists()

    def validate(self, attrs):
        audience = attrs.get('audience', getattr(self.instance, 'audience', HostelNotice.AUDIENCE_ALL))
        audience = str(audience or '').upper()
        if audience in ('BLOCK', 'HOSTEL_BLOCK'):
            audience = HostelNotice.AUDIENCE_BUILDING
        if audience not in dict(HostelNotice.AUDIENCE_CHOICES):
            raise serializers.ValidationError({'target_audience': 'Invalid target audience.'})
        attrs['audience'] = audience
        building = attrs.get('building', getattr(self.instance, 'building', None))
        target_year = attrs.get('target_year', getattr(self.instance, 'target_year', None))
        if audience == HostelNotice.AUDIENCE_BUILDING and not building:
            raise serializers.ValidationError({'building': 'Select a hostel block for a block announcement.'})
        if audience == HostelNotice.AUDIENCE_YEAR and not target_year:
            raise serializers.ValidationError({'target_year': 'Select the study year for a year announcement.'})
        return attrs


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


class AssetMaintenanceLogSerializer(serializers.ModelSerializer):
    asset_code = serializers.CharField(source='asset.asset_code', read_only=True)

    class Meta:
        model = AssetMaintenanceLog
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'performed_by')


class AssetSerializer(serializers.ModelSerializer):
    building_name = serializers.CharField(source='building.name', read_only=True, default='')
    hostel_block_name = serializers.CharField(source='building.name', read_only=True, default='')
    room_number = serializers.CharField(source='room.room_number', read_only=True, default='')
    asset_name = serializers.CharField(source='name', read_only=True)
    custodian_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    maintenance_logs = AssetMaintenanceLogSerializer(many=True, read_only=True)

    class Meta:
        model = Asset
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_custodian_name(self, obj):
        return str(obj.custodian) if obj.custodian_id else ''

    def validate(self, attrs):
        condition_to_status = {
            Asset.CONDITION_GOOD: Asset.STATUS_GOOD,
            Asset.CONDITION_REPAIR: Asset.STATUS_NEEDS_REPAIR,
            Asset.CONDITION_DAMAGED: Asset.STATUS_DAMAGED,
        }
        if 'condition' in attrs and 'status' not in attrs:
            attrs['status'] = condition_to_status.get(attrs['condition'], Asset.STATUS_GOOD)
        return attrs


# ---------------------------------------------------------------------------
# Notices / clearance / audit
# ---------------------------------------------------------------------------


class HostelNoticeSerializer(serializers.ModelSerializer):
    building_name = serializers.CharField(source='building.name', read_only=True, default='')
    created_by_name = serializers.SerializerMethodField()
    is_live = serializers.BooleanField(read_only=True)
    is_read = serializers.SerializerMethodField()
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    read_count = serializers.SerializerMethodField()

    class Meta:
        model = HostelNotice
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by')

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by_id else ''

    def get_read_count(self, obj):
        return obj.reads.count() if hasattr(obj, 'reads') else 0

    def get_is_read(self, obj):
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            return False
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('reads')
        if prefetched is not None:
            return any(r.user_id == request.user.id for r in prefetched)
        return obj.reads.filter(user_id=request.user.id).exists()


class ClearanceRecordSerializer(serializers.ModelSerializer):
    cleared_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ClearanceRecord
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_cleared_by_name(self, obj):
        return str(obj.cleared_by) if obj.cleared_by_id else ''


class VacatingRequestSerializer(serializers.ModelSerializer):
    student_detail = StudentBriefSerializer(source='student', read_only=True)
    clearances = ClearanceRecordSerializer(many=True, read_only=True)
    room_label = serializers.SerializerMethodField()

    class Meta:
        model = VacatingRequest
        fields = '__all__'
        read_only_fields = (
            'created_at',
            'updated_at',
            'status',
            'room_verified',
            'room_verified_by',
            'room_verified_at',
            'assets_verified',
            'assets_verified_by',
            'assets_verified_at',
            'dues_cleared',
            'dues_cleared_by',
            'dues_cleared_at',
            'approved_by',
            'approved_at',
        )

    def get_room_label(self, obj):
        return str(obj.allocation.room) if obj.allocation_id else ''


class VacatingStepSerializer(serializers.Serializer):
    step = serializers.ChoiceField(choices=['room', 'assets', 'dues'])
    approve = serializers.BooleanField(required=False, default=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class VacatingDecisionSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


class HostelAuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = HostelAuditLog
        fields = '__all__'

    def get_user_name(self, obj):
        return str(obj.user) if obj.user_id else 'system'


class StudentSyncRunSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentSyncRun
        fields = '__all__'

    def get_performed_by_name(self, obj):
        return str(obj.performed_by) if obj.performed_by_id else ''


class StudentFacilityAdminUpdateSerializer(serializers.Serializer):
    residence_category = serializers.ChoiceField(choices=['DAY_SCHOLAR', 'HOSTELLER'])
    uses_college_bus = serializers.BooleanField(required=False, default=False)
    day_scholar_address = serializers.CharField(required=False, allow_blank=True, default='')
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True, default='')
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True, default='')
    gender = serializers.CharField(required=False, allow_blank=True, default='')
    academic_year = serializers.IntegerField(required=False, allow_null=True, default=None)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    profile_verified = serializers.BooleanField(required=False, default=False)


class ManualTransportCancelSerializer(serializers.Serializer):
    end_date = serializers.DateField(required=False, allow_null=True, default=None)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


class AutoAllocationSerializer(serializers.Serializer):
    """Input for bulk automatic hostel room allocation."""

    students = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list,
        help_text='Student profile ids selected in the UI.',
    )
    all_eligible = serializers.BooleanField(required=False, default=False)
    building = serializers.IntegerField(required=False, allow_null=True)
    gender = serializers.ChoiceField(
        choices=['MALE', 'FEMALE', 'OTHER'], required=False, allow_blank=True,
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    expected_end_date = serializers.DateField(required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')



__all__ = [
    'AnnouncementSerializer',
    'AssetMaintenanceLogSerializer',
    'AssetSerializer',
    'AutoAllocationSerializer',
    'BedSerializer',
    'BuildingSerializer',
    'ClearanceRecordSerializer',
    'CollegeBusSerializer',
    'ComplaintSerializer',
    'ComplaintStatusHistorySerializer',
    'ComplaintStatusUpdateSerializer',
    'FacilityChangeRequestSerializer',
    'FacilityFacilitySelectionSerializer',
    'FacilityHistorySerializer',
    'FacilitySelectionWindowSerializer',
    'FeePaymentCreateSerializer',
    'FeePaymentSerializer',
    'FeeStructureSerializer',
    'FloorSerializer',
    'GatePassSerializer',
    'HostelAuditLogSerializer',
    'HostelConfigurationSerializer',
    'HostelNoticeSerializer',
    'HostelWardenAssignmentSerializer',
    'LateEntrySerializer',
    'ManualTransportCancelSerializer',
    'MealBookingSerializer',
    'MessFeedbackSerializer',
    'MessMenuSerializer',
    'MessPreferenceSerializer',
    'MessRequestSerializer',
    'RoomAllocationCreateSerializer',
    'RoomAllocationSerializer',
    'RoomSerializer',
    'StudentBriefSerializer',
    'StudentFacilityAdminUpdateSerializer',
    'StudentFacilityProfileSerializer',
    'StudentFeeCreateSerializer',
    'StudentFeeSerializer',
    'StudentLeaveRequestSerializer',
    'StudentSyncRunSerializer',
    'TransferAllocationSerializer',
    'TransportAssignmentCreateSerializer',
    'TransportAssignmentSerializer',
    'TransportRouteSerializer',
    'TransportStopSerializer',
    'VacatingDecisionSerializer',
    'VacatingRequestSerializer',
    'VacatingStepSerializer',
    'VisitorSerializer',
]
