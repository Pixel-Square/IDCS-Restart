"""REST API for the Hostel / Student Facilities module.

All routes are mounted under ``/api/hostel/`` and ``/api/v1/hostel/`` (see
``erp/urls.py``). Permission checks are enforced server-side; hiding menu items
in the frontend is never sufficient.
"""

from decimal import Decimal
from datetime import datetime, time, timedelta

from django.db.models import Avg, Count, F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import AcademicYear, StudentProfile

from . import services
from .models import (
    ALLOCATION_ACTIVE,
    FACILITY_STATUS_APPROVED,
    HOSTEL_CAT_BOYS,
    HOSTEL_CAT_GIRLS,
    HOSTEL_CAT_MIXED,
    HOSTEL_CAT_STAFF,
    HOSTEL_CATEGORY_CHOICES,
    RESIDENCE_CATEGORY_CHOICES,
    RESIDENCE_DAY_SCHOLAR,
    RESIDENCE_HOSTELLER,
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
    FacilitySelectionWindow,
    FeePayment,
    FeeStructure,
    Floor,
    GatePass,
    HostelAuditLog,
    HostelConfiguration,
    HostelNotice,
    HostelNoticeRead,
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
)
from .permissions import (
    IsAdminOrReadOnly,
    IsHostelAdmin,
    IsHostelStaff,
    IsHostellerStudent,
    IsStudentUser,
    IsWardenOrHostelAdmin,
    is_hostel_admin,
    is_hostel_staff,
    is_warden,
    warden_building_ids,
)
from .serializers import (
    AnnouncementSerializer,
    AssetMaintenanceLogSerializer,
    AssetSerializer,
    AutoAllocationSerializer,
    BedSerializer,
    BuildingSerializer,
    ClearanceRecordSerializer,
    CollegeBusSerializer,
    ComplaintSerializer,
    ComplaintStatusUpdateSerializer,
    FacilityChangeRequestSerializer,
    FacilityFacilitySelectionSerializer,
    FacilityHistorySerializer,
    FacilitySelectionWindowSerializer,
    FeePaymentCreateSerializer,
    FeePaymentSerializer,
    FeeStructureSerializer,
    FloorSerializer,
    GatePassSerializer,
    HostelAuditLogSerializer,
    HostelConfigurationSerializer,
    HostelNoticeSerializer,
    HostelWardenAssignmentSerializer,
    LateEntrySerializer,
    ManualTransportCancelSerializer,
    MealBookingSerializer,
    MessFeedbackSerializer,
    MessMenuSerializer,
    MessPreferenceSerializer,
    MessRequestSerializer,
    RoomAllocationCreateSerializer,
    RoomAllocationSerializer,
    RoomSerializer,
    StudentBriefSerializer,
    StudentFacilityAdminUpdateSerializer,
    StudentFacilityProfileSerializer,
    StudentFeeCreateSerializer,
    StudentFeeSerializer,
    StudentLeaveRequestSerializer,
    StudentSyncRunSerializer,
    TransferAllocationSerializer,
    TransportAssignmentCreateSerializer,
    TransportAssignmentSerializer,
    TransportRouteSerializer,
    TransportStopSerializer,
    VacatingDecisionSerializer,
    VacatingRequestSerializer,
    VacatingStepSerializer,
    VisitorSerializer,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _require_student(request) -> StudentProfile:
    student = services.get_student_profile_for_user(request.user)
    if student is None:
        raise ValidationError({'detail': 'No student profile is linked to this account.'})
    return student


def _paginate(request, queryset, serializer_class, context=None):
    try:
        page = max(int(request.query_params.get('page', 1) or 1), 1)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get('page_size', 50) or 50)
    except (TypeError, ValueError):
        page_size = 50
    page_size = min(max(page_size, 1), 500)

    total = queryset.count()
    start = (page - 1) * page_size
    data = serializer_class(
        queryset[start:start + page_size],
        many=True,
        context=context or {'request': request},
    ).data
    return Response({'count': total, 'page': page, 'page_size': page_size, 'results': data})


def _scope_to_warden_buildings(queryset, user, field='building'):
    """Wardens only see the buildings assigned to them.

    Other hostel staff roles (maintenance, mess, transport, security) are
    restricted by their own endpoints/roles rather than by building.
    """
    if is_hostel_admin(user):
        return queryset
    if not is_warden(user):
        return queryset
    ids = warden_building_ids(user)
    if not ids:
        return queryset.none()
    return queryset.filter(**{f'{field}_id__in': ids})


def _building_from_params(params):
    value = (params.get('building') or '').strip()
    if not value:
        return None
    if value.isdigit():
        return Building.objects.filter(pk=int(value)).first()
    return Building.objects.filter(code__iexact=value).first()


def _room_queryset():
    return Room.objects.select_related('building', 'floor').prefetch_related('beds')


# ---------------------------------------------------------------------------
# Student self-service: facility selection & hostel portal
# ---------------------------------------------------------------------------


class MyFacilityView(APIView):
    """The student's Hostel / Day Scholar / College Bus selection.

    Available to every student: this is the page that lets them choose a
    residence category. The rest of the hostel portal is gated on selecting
    ``HOSTELLER``.
    """

    permission_classes = [IsStudentUser]

    def _payload(self, request, facility=None):
        student = _require_student(request)
        facility = facility or getattr(student, 'hostel_facility', None)
        allocation = (
            RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE)
            .select_related('room', 'room__building', 'room__floor')
            .first()
        )
        transport = (
            TransportAssignment.objects.filter(
                student=student,
                status__in=[TransportAssignment.STATUS_PENDING, TransportAssignment.STATUS_ACTIVE],
            )
            .select_related('route', 'bus', 'stop')
            .first()
        )
        policy = services.get_policy()
        window = services.get_selection_window(services.get_active_academic_year())
        return {
            'student': StudentBriefSerializer(student, context={'request': request}).data,
            'facility': StudentFacilityProfileSerializer(facility).data if facility else None,
            'access': services.hostel_access_for_user(request.user),
            'selection_window': (
                FacilitySelectionWindowSerializer(window).data if window else None
            ),
            'selection_state': services.selection_window_state(window),
            'policy': {
                'allow_student_self_selection': policy.allow_student_self_selection,
                'require_approval_for_selection': policy.require_approval_for_selection,
                'allow_student_edit_after_selection': policy.allow_student_edit_after_selection,
                'require_approval_for_changes': policy.require_approval_for_changes,
            },
            'allocation': RoomAllocationSerializer(allocation).data if allocation else None,
            'transport_assignment': TransportAssignmentSerializer(transport).data if transport else None,
            'options': {
                'residence_categories': [
                    {'value': code, 'label': label} for code, label in RESIDENCE_CATEGORY_CHOICES
                ],
                'college_bus': {'value': True, 'label': 'College Bus'},
            },
        }

    def get(self, request):
        return Response(self._payload(request))

    def post(self, request):
        payload = FacilityFacilitySelectionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        student = _require_student(request)

        academic_year = None
        if data.get('academic_year'):
            academic_year = get_object_or_404(AcademicYear, pk=data['academic_year'])

        result = services.submit_facility_selection(
            student=student,
            residence_category=data['residence_category'],
            uses_college_bus=data.get('uses_college_bus', False),
            day_scholar_address=data.get('day_scholar_address', ''),
            emergency_contact_name=data.get('emergency_contact_name', ''),
            emergency_contact_phone=data.get('emergency_contact_phone', ''),
            gender=data.get('gender', ''),
            academic_year=academic_year,
            actor=request.user,
            reason=data.get('reason', ''),
        )
        body = {
            'applied': result['applied'],
            'requires_approval': result['requires_approval'],
            'message': (
                'Your facility selection has been saved.'
                if result['applied']
                else 'Your selection was submitted and is awaiting administrator approval.'
            ),
            'request': (
                FacilityChangeRequestSerializer(result['request']).data if result['request'] else None
            ),
        }
        body.update(self._payload(request, facility=result['facility']))
        return Response(body, status=status.HTTP_200_OK if result['applied'] else status.HTTP_202_ACCEPTED)


class MyHostelOverviewView(APIView):
    """Hostel landing page. Returns 403 for Day Scholars / unselected students."""

    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        allocation = (
            RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE)
            .select_related('room', 'room__building', 'room__floor', 'bed')
            .first()
        )
        fees = StudentFee.objects.filter(student=student).select_related('fee_structure')
        outstanding = fees.aggregate(total=Sum('amount_due'), paid=Sum('amount_paid'))
        notices_qs = services.notices_for_student(student)
        notices = notices_qs[:10]
        unread_notices = notices_qs.exclude(reads__user=request.user).count()
        return Response(
            {
                'access': services.hostel_access_for_user(request.user),
                'student': StudentBriefSerializer(student, context={'request': request}).data,
                'facility': (
                    StudentFacilityProfileSerializer(student.hostel_facility).data
                    if hasattr(student, 'hostel_facility')
                    else None
                ),
                'allocation': RoomAllocationSerializer(allocation).data if allocation else None,
                'fees_summary': {
                    'total_due': str(outstanding['total'] or 0),
                    'total_paid': str(outstanding['paid'] or 0),
                    'outstanding': str(max((outstanding['total'] or 0) - (outstanding['paid'] or 0), 0)),
                },
                'open_complaints': Complaint.objects.filter(student=student).exclude(
                    status__in=[Complaint.STATUS_RESOLVED, Complaint.STATUS_CLOSED, Complaint.STATUS_REJECTED]
                ).count(),
                'unread_notices': unread_notices,
                'notices': HostelNoticeSerializer(notices, many=True, context={'request': request}).data,
            }
        )


class MyAllocationView(APIView):
    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = (
            RoomAllocation.objects.filter(student=student)
            .select_related('room', 'room__building', 'room__floor', 'bed')
            .order_by('-start_date', '-id')
        )
        return _paginate(request, qs, RoomAllocationSerializer)


class MyFeesView(APIView):
    permission_classes = [IsStudentUser]

    def get(self, request):
        student = _require_student(request)
        qs = (
            StudentFee.objects.filter(student=student)
            .select_related('fee_structure')
            .prefetch_related('payments')
            .order_by('-due_date', '-id')
        )
        totals = qs.aggregate(due=Sum('amount_due'), paid=Sum('amount_paid'))
        response = _paginate(request, qs, StudentFeeSerializer)
        response.data['summary'] = {
            'total_due': str(totals['due'] or 0),
            'total_paid': str(totals['paid'] or 0),
            'outstanding': str(max((totals['due'] or 0) - (totals['paid'] or 0), 0)),
        }
        return response


class MyComplaintsView(APIView):
    permission_classes = [IsHostellerStudent]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        student = _require_student(request)
        qs = Complaint.objects.filter(student=student).prefetch_related('history').order_by('-created_at')
        return _paginate(request, qs, ComplaintSerializer)

    def post(self, request):
        student = _require_student(request)
        allocation = (
            RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE)
            .select_related('room', 'room__floor')
            .first()
        )
        data = request.data.copy()
        data['student'] = student.pk
        if allocation is not None:
            data.setdefault('building', allocation.room.building_id)
            data.setdefault('floor', allocation.room.floor_id)
            data.setdefault('room', allocation.room_id)
        serializer = ComplaintSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        complaint = serializer.save()
        ComplaintStatusHistory.objects.create(
            complaint=complaint,
            status=Complaint.STATUS_OPEN,
            note='Complaint submitted.',
            changed_by=request.user,
        )
        services.record_audit(request.user, 'COMPLAINT_CREATED', complaint, {'student': student.reg_no})
        return Response(ComplaintSerializer(complaint, context={'request': request}).data, status=201)


class MyMessMenuView(APIView):
    permission_classes = [IsHostellerStudent]

    def get(self, request):
        today = timezone.localdate()
        days = int(request.query_params.get('days', 7) or 7)
        qs = MessMenu.objects.filter(
            date__gte=today,
            date__lte=today + timedelta(days=max(days, 1)),
            is_published=True,
        ).select_related('building').order_by('date', 'meal_type')
        return Response(MessMenuSerializer(qs, many=True).data)


class MyMessFeedbackView(APIView):
    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = MessFeedback.objects.filter(student=student).order_by('-date', '-id')
        return _paginate(request, qs, MessFeedbackSerializer)

    def post(self, request):
        student = _require_student(request)
        data = request.data.copy()
        data['student'] = student.pk
        existing = MessFeedback.objects.filter(
            student=student,
            date=data.get('date') or timezone.localdate(),
            meal_type=data.get('meal_type'),
        ).first()
        serializer = MessFeedbackSerializer(existing, data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        feedback = serializer.save()
        return Response(
            MessFeedbackSerializer(feedback).data,
            status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED,
        )


class MyMessPreferenceView(APIView):
    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = MessPreference.objects.filter(student=student)
        return Response(MessPreferenceSerializer(qs, many=True).data)

    def post(self, request):
        student = _require_student(request)
        academic_year = services.get_active_academic_year()
        data = request.data.copy()
        data['student'] = student.pk
        if academic_year is not None:
            data.setdefault('academic_year', academic_year.pk)
        existing = MessPreference.objects.filter(student=student, academic_year=academic_year).first()
        serializer = MessPreferenceSerializer(existing, data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        pref = serializer.save(student=student, academic_year=academic_year)
        return Response(MessPreferenceSerializer(pref).data, status=200 if existing else 201)


class MyMealBookingsView(APIView):
    """Per-meal opt-in / opt-out for the logged-in hosteller."""

    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = MealBooking.objects.filter(student=student).order_by('-date', 'meal_type')
        params = request.query_params
        if params.get('date'):
            qs = qs.filter(date=params['date'])
        if params.get('from'):
            qs = qs.filter(date__gte=params['from'])
        if params.get('to'):
            qs = qs.filter(date__lte=params['to'])
        return _paginate(request, qs, MealBookingSerializer, context={'request': request})

    def post(self, request):
        student = _require_student(request)
        data = request.data.copy()
        data['student'] = student.pk
        date = data.get('date') or timezone.localdate()
        meal_type = str(data.get('meal_type') or '').upper()
        existing = MealBooking.objects.filter(
            student=student, date=date, meal_type=meal_type
        ).first()
        serializer = MealBookingSerializer(existing, data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        booking = serializer.save(student=student)
        return Response(
            MealBookingSerializer(booking, context={'request': request}).data,
            status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED,
        )


class MyMessRequestsView(APIView):
    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = MessRequest.objects.filter(student=student).order_by('-created_at')
        return _paginate(request, qs, MessRequestSerializer)

    def post(self, request):
        student = _require_student(request)
        data = request.data.copy()
        data['student'] = student.pk
        serializer = MessRequestSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(student=student, status=MessRequest.STATUS_PENDING)
        return Response(MessRequestSerializer(obj).data, status=201)


class MyLeavesView(APIView):
    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = StudentLeaveRequest.objects.filter(student=student).order_by('-from_date', '-id')
        return _paginate(request, qs, StudentLeaveRequestSerializer)

    def post(self, request):
        student = _require_student(request)
        data = request.data.copy()
        data['student'] = student.pk
        serializer = StudentLeaveRequestSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(student=student, status=StudentLeaveRequest.STATUS_PENDING)
        services.record_audit(request.user, 'LEAVE_REQUESTED', obj, {'student': student.reg_no})
        return Response(StudentLeaveRequestSerializer(obj).data, status=201)


class MyGatePassesView(APIView):
    """Student movement hub: submit requests and view history."""

    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = (
            GatePass.objects.filter(student=student)
            .select_related('approved_by', 'security_guard_out', 'security_guard_in', 'student', 'student__user')
            .order_by('-from_date', '-id')
        )
        params = request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('pass_type'):
            qs = qs.filter(pass_type=params['pass_type'].upper())
        response = _paginate(request, qs, GatePassSerializer)
        now = timezone.now()
        response.data['summary'] = {
            'active': qs.filter(status=GatePass.STATUS_APPROVED, expected_in_time__gte=now).count(),
            'pending': qs.filter(status=GatePass.STATUS_PENDING).count(),
            'late_entries': qs.filter(is_late_entry=True).count(),
        }
        return response

    def post(self, request):
        student = _require_student(request)
        data = request.data.copy()
        data['student'] = student.pk
        leave_request = None
        leave_id = data.get('leave_request')
        if leave_id:
            leave_request = StudentLeaveRequest.objects.filter(
                pk=leave_id, student=student
            ).first()
            if leave_request is None:
                raise ValidationError({'leave_request': 'Leave request not found for this student.'})
            if leave_request.status != StudentLeaveRequest.STATUS_APPROVED:
                raise ValidationError({'leave_request': 'Only approved leave requests can be linked to a gate pass.'})
            data.setdefault('from_date', leave_request.from_date)
            data.setdefault('to_date', leave_request.to_date)
            data.setdefault('reason', leave_request.reason)
        serializer = GatePassSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(
            student=student,
            status=GatePass.STATUS_PENDING,
            leave_request=leave_request,
        )
        services.record_audit(request.user, 'GATE_PASS_REQUESTED', obj, {'student': student.reg_no})
        return Response(GatePassSerializer(obj, context={'request': request}).data, status=201)


class MyGatePassCancelView(APIView):
    permission_classes = [IsHostellerStudent]

    def post(self, request, pk):
        student = _require_student(request)
        obj = get_object_or_404(GatePass, pk=pk, student=student)
        if obj.status not in (GatePass.STATUS_PENDING, GatePass.STATUS_APPROVED):
            raise ValidationError({'detail': 'Only pending or approved passes can be cancelled.'})
        if obj.actual_out_time:
            raise ValidationError({'detail': 'This pass has already been used at the gate.'})
        obj.status = GatePass.STATUS_CANCELLED
        obj.save(update_fields=['status', 'updated_at'])
        services.record_audit(request.user, 'GATE_PASS_CANCELLED', obj)
        return Response(GatePassSerializer(obj, context={'request': request}).data)


class MyVisitorsView(APIView):
    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = Visitor.objects.filter(student=student).select_related('building', 'room').order_by('-entry_at')
        return _paginate(request, qs, VisitorSerializer)


class MyTransportView(APIView):
    """Transport details for any student who uses the College Bus."""

    permission_classes = [IsStudentUser]

    def get(self, request):
        student = _require_student(request)
        qs = (
            TransportAssignment.objects.filter(student=student)
            .select_related('route', 'bus', 'stop')
            .order_by('-assigned_at')
        )
        active = qs.filter(status__in=['PENDING', 'ACTIVE']).first()
        return Response(
            {
                'active': TransportAssignmentSerializer(active).data if active else None,
                'history': TransportAssignmentSerializer(qs, many=True).data,
            }
        )


class MyNoticesView(APIView):
    permission_classes = [IsStudentUser]

    def get(self, request):
        student = _require_student(request)
        qs = services.notices_for_student(student).prefetch_related('reads')
        return _paginate(request, qs, HostelNoticeSerializer)

    def post(self, request):
        student = _require_student(request)
        notice_id = request.data.get('notice') or request.data.get('notice_id')
        if not notice_id:
            raise ValidationError({'notice': 'Provide the notice id to mark as read.'})
        notice = get_object_or_404(HostelNotice, pk=notice_id)
        if not services.notices_for_student(student).filter(pk=notice.pk).exists():
            raise ValidationError({'notice': 'This notice is not addressed to you.'})
        services.mark_notice_read(notice=notice, user=request.user)
        return Response({'detail': 'Notice marked as read.'})


class MyAnnouncementsView(APIView):
    """Notification feed for a student, including read/acknowledgment state."""

    permission_classes = [IsStudentUser]

    def get(self, request):
        student = _require_student(request)
        qs = services.notices_for_student(student).prefetch_related('reads')
        params = request.query_params
        if params.get('priority'):
            qs = qs.filter(priority=params['priority'].upper())
        if params.get('unread') in ('1', 'true', 'yes'):
            qs = qs.exclude(reads__user=request.user)
        response = _paginate(request, qs, AnnouncementSerializer)
        response.data['summary'] = {
            'unread': services.notices_for_student(student).exclude(reads__user=request.user).count(),
            'emergency': services.notices_for_student(student).filter(priority=HostelNotice.PRIORITY_EMERGENCY).count(),
        }
        return response

    def post(self, request):
        student = _require_student(request)
        notice_id = request.data.get('notice') or request.data.get('notice_id') or request.data.get('id')
        if not notice_id:
            raise ValidationError({'notice': 'Provide the announcement id to mark as read.'})
        notice = get_object_or_404(HostelNotice, pk=notice_id)
        if not services.notices_for_student(student).filter(pk=notice.pk).exists():
            raise ValidationError({'notice': 'This announcement is not addressed to you.'})
        read, created = HostelNoticeRead.objects.get_or_create(notice=notice, user=request.user)
        return Response({'detail': 'Marked as read.', 'read_at': read.read_at, 'created': created})


class MyVacatingView(APIView):
    permission_classes = [IsHostellerStudent]

    def get(self, request):
        student = _require_student(request)
        qs = VacatingRequest.objects.filter(student=student).prefetch_related('clearances').order_by('-created_at')
        return _paginate(request, qs, VacatingRequestSerializer)

    def post(self, request):
        student = _require_student(request)
        obj = services.create_vacating_request(
            student=student,
            requested_vacate_date=request.data.get('requested_vacate_date') or None,
            reason=request.data.get('reason', ''),
        )
        return Response(VacatingRequestSerializer(obj).data, status=201)


# ---------------------------------------------------------------------------
# Configuration, dashboard, student directory
# ---------------------------------------------------------------------------


class HostelConfigView(APIView):
    permission_classes = [IsHostelAdmin]

    def get(self, request):
        return Response(HostelConfigurationSerializer(services.get_policy()).data)

    def patch(self, request):
        config = services.get_policy()
        serializer = HostelConfigurationSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        services.record_audit(request.user, 'CONFIG_UPDATED', config, request.data)
        return Response(serializer.data)


class FacilitySelectionWindowViewSet(viewsets.ModelViewSet):
    queryset = FacilitySelectionWindow.objects.select_related('academic_year').all()
    serializer_class = FacilitySelectionWindowSerializer
    permission_classes = [IsHostelAdmin]

    def perform_create(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'SELECTION_WINDOW_CREATED', obj)


class DashboardView(APIView):
    permission_classes = [IsHostelStaff]

    def get(self, request):
        params = request.query_params.dict()
        if is_warden(request.user) and not is_hostel_admin(request.user):
            ids = warden_building_ids(request.user)
            if ids and not params.get('building'):
                params['building'] = ','.join(str(building_id) for building_id in sorted(ids))
        return Response(services.dashboard_summary(params))


class StudentDirectoryView(APIView):
    permission_classes = [IsHostelStaff]

    def get(self, request):
        qs = services.build_student_directory_queryset(request.query_params.dict())
        return _paginate(request, qs, StudentBriefSerializer)


class StudentDetailView(APIView):
    permission_classes = [IsHostelStaff]

    def get(self, request, reg_no):
        student = get_object_or_404(
            StudentProfile.objects.select_related(
                'user',
                'section',
                'section__batch',
                'section__batch__course',
                'section__batch__course__department',
                'home_department',
                'hostel_facility',
            ),
            reg_no__iexact=reg_no,
        )
        allocations = (
            RoomAllocation.objects.filter(student=student)
            .select_related('room', 'room__building', 'room__floor', 'bed')
            .order_by('-start_date', '-id')
        )
        return Response(
            {
                'student': StudentBriefSerializer(student, context={'request': request}).data,
                'facility': (
                    StudentFacilityProfileSerializer(student.hostel_facility).data
                    if hasattr(student, 'hostel_facility')
                    else None
                ),
                'facility_history': FacilityHistorySerializer(
                    FacilityHistory.objects.filter(student=student).order_by('-effective_from', '-id'),
                    many=True,
                ).data,
                'change_requests': FacilityChangeRequestSerializer(
                    FacilityChangeRequest.objects.filter(student=student).order_by('-created_at'),
                    many=True,
                ).data,
                'allocations': RoomAllocationSerializer(allocations, many=True).data,
                'transport': TransportAssignmentSerializer(
                    TransportAssignment.objects.filter(student=student)
                    .select_related('route', 'bus', 'stop')
                    .order_by('-assigned_at'),
                    many=True,
                ).data,
                'fees': StudentFeeSerializer(
                    StudentFee.objects.filter(student=student).select_related('fee_structure'),
                    many=True,
                ).data,
                'complaints': ComplaintSerializer(
                    Complaint.objects.filter(student=student).order_by('-created_at')[:50],
                    many=True,
                ).data,
                'access': services.hostel_access_for_user(
                    getattr(student, 'user', None)
                ) if getattr(student, 'user', None) else {},
            }
        )


class StudentFacilityUpdateView(APIView):
    """Administrator override of a student's facility selection."""

    permission_classes = [IsHostelAdmin]

    def patch(self, request, reg_no):
        student = get_object_or_404(StudentProfile, reg_no__iexact=reg_no)
        payload = StudentFacilityAdminUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        academic_year = None
        if data.get('academic_year'):
            academic_year = get_object_or_404(AcademicYear, pk=data['academic_year'])

        facility = services.apply_facility(
            student=student,
            residence_category=data['residence_category'],
            uses_college_bus=data.get('uses_college_bus', False),
            day_scholar_address=data.get('day_scholar_address', ''),
            emergency_contact_name=data.get('emergency_contact_name', ''),
            emergency_contact_phone=data.get('emergency_contact_phone', ''),
            gender=data.get('gender', ''),
            academic_year=academic_year,
            source=FacilityHistory.SOURCE_ADMIN,
            actor=request.user,
            remarks=data.get('reason', ''),
        )
        if data.get('profile_verified'):
            facility.profile_verified = True
            facility.verified_by = request.user
            facility.verified_at = timezone.now()
            facility.save(update_fields=['profile_verified', 'verified_by', 'verified_at', 'updated_at'])
        return Response(StudentFacilityProfileSerializer(facility).data)


class StudentBulkImportView(APIView):
    permission_classes = [IsHostelAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError({'file': 'Attach a CSV file using the "file" field.'})
        if not upload.name.lower().endswith('.csv'):
            raise ValidationError({'file': 'Only .csv files are supported.'})
        run = services.import_facility_selections_csv(
            file_bytes=upload.read(),
            filename=upload.name,
            actor=request.user,
            overwrite_verified=str(request.data.get('overwrite_verified', '')).lower() in ('1', 'true', 'yes'),
        )
        return Response(StudentSyncRunSerializer(run).data, status=status.HTTP_201_CREATED)


class StudentSyncRunsView(APIView):
    permission_classes = [IsHostelAdmin]

    def get(self, request):
        qs = StudentSyncRun.objects.select_related('performed_by').order_by('-started_at')
        return _paginate(request, qs, StudentSyncRunSerializer)


class FacilityChangeRequestViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FacilityChangeRequest.objects.select_related(
        'student', 'student__user', 'requested_by', 'reviewed_by'
    ).all()
    serializer_class = FacilityChangeRequestSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        status_value = self.request.query_params.get('status')
        if status_value:
            qs = qs.filter(status=status_value.upper())
        student_id = self.request.query_params.get('student')
        if student_id and str(student_id).isdigit():
            qs = qs.filter(student_id=int(student_id))
        return qs

    @action(detail=True, methods=['post'], permission_classes=[IsHostelAdmin])
    def decision(self, request, pk=None):
        change_request = self.get_object()
        approve = str(request.data.get('approve', '')).lower() in ('1', 'true', 'yes')
        if 'approve' not in request.data:
            raise ValidationError({'approve': 'Provide approve=true or approve=false.'})
        obj = services.review_facility_request(
            change_request=change_request,
            actor=request.user,
            approve=approve,
            remarks=request.data.get('remarks', ''),
        )
        return Response(FacilityChangeRequestSerializer(obj).data)


class FacilityHistoryView(APIView):
    permission_classes = [IsHostelStaff]

    def get(self, request):
        qs = FacilityHistory.objects.select_related('student', 'student__user').order_by('-effective_from', '-id')
        student = request.query_params.get('student')
        if student and str(student).isdigit():
            qs = qs.filter(student_id=int(student))
        reg_no = request.query_params.get('reg_no')
        if reg_no:
            qs = qs.filter(student__reg_no__iexact=reg_no)
        return _paginate(request, qs, FacilityHistorySerializer)


# ---------------------------------------------------------------------------
# Infrastructure
# ---------------------------------------------------------------------------


class BuildingViewSet(viewsets.ModelViewSet):
    serializer_class = BuildingSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = Building.objects.prefetch_related('warden_assignments__user').annotate(
            actual_floor_count=Count('floors', distinct=True),
            rooms_count=Count('rooms', distinct=True),
        )
        building_type = self.request.query_params.get('type') or self.request.query_params.get('building_type')
        if building_type:
            qs = qs.filter(building_type=building_type.upper())
        hostel_category = self.request.query_params.get('hostel_category') or self.request.query_params.get('hostel_for')
        if hostel_category:
            qs = qs.filter(hostel_category=hostel_category.upper())
        status_value = self.request.query_params.get('status')
        if status_value:
            qs = qs.filter(status=status_value.upper())
        if self.request.query_params.get('hostel_only') in ('1', 'true', 'yes'):
            qs = qs.filter(building_type=Building.TYPE_HOSTEL)
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q))
        return qs.order_by('name')

    def perform_create(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'BUILDING_CREATED', obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'BUILDING_UPDATED', obj)

    def perform_destroy(self, instance):
        if RoomAllocation.objects.filter(room__building=instance, status=ALLOCATION_ACTIVE).exists():
            raise ValidationError({'detail': 'Cannot delete a building with active allocations.'})
        services.record_audit(self.request.user, 'BUILDING_DELETED', instance)
        instance.delete()

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        building = self.get_object()
        rooms = Room.objects.filter(building=building)
        hostel_rooms = rooms.filter(room_purpose=Room.PURPOSE_HOSTEL)
        occupied = RoomAllocation.objects.filter(
            room__building=building, status=ALLOCATION_ACTIVE
        ).count()
        return Response(
            {
                'building': BuildingSerializer(building, context={'request': request}).data,
                'floors': FloorSerializer(building.floors.all(), many=True).data,
                'rooms': RoomSerializer(rooms.select_related('floor'), many=True).data,
                'totals': {
                    'planned_floors': building.planned_floors,
                    'actual_floors': building.floors.count(),
                    'rooms': rooms.count(),
                    'hostel_rooms': hostel_rooms.count(),
                    'capacity': int(sum(r.capacity for r in rooms) or 0),
                    'hostel_capacity': int(sum(r.capacity for r in hostel_rooms) or 0),
                    'occupied_beds': occupied,
                },
            }
        )


class FloorViewSet(viewsets.ModelViewSet):
    serializer_class = FloorSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = Floor.objects.select_related('building').annotate(
            rooms_count=Count('rooms', distinct=True),
        )
        building = self.request.query_params.get('building')
        if building:
            if str(building).isdigit():
                qs = qs.filter(building_id=int(building))
            else:
                qs = qs.filter(building__code__iexact=building)
        status_value = self.request.query_params.get('status')
        if status_value:
            qs = qs.filter(status=status_value.upper())
        return qs.order_by('building__name', 'floor_number')

    def perform_create(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'FLOOR_CREATED', obj)

    def perform_destroy(self, instance):
        if RoomAllocation.objects.filter(room__floor=instance, status=ALLOCATION_ACTIVE).exists():
            raise ValidationError({'detail': 'Cannot delete a floor with active allocations.'})
        instance.delete()


class RoomViewSet(viewsets.ModelViewSet):
    serializer_class = RoomSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = _room_queryset()
        params = self.request.query_params
        building = params.get('building')
        if building:
            if str(building).isdigit():
                qs = qs.filter(building_id=int(building))
            else:
                qs = qs.filter(building__code__iexact=building)
        floor = params.get('floor')
        if floor and str(floor).isdigit():
            qs = qs.filter(floor_id=int(floor))
        room_type = params.get('room_type')
        if room_type:
            qs = qs.filter(room_type=room_type.upper())
        purpose = params.get('room_purpose') or params.get('purpose')
        if purpose:
            qs = qs.filter(room_purpose=purpose.upper())
        hostel_category = (params.get('hostel_category') or params.get('hostel_for') or '').upper()
        if hostel_category:
            qs = qs.filter(
                Q(hostel_category=hostel_category)
                | Q(hostel_category='', building__hostel_category=hostel_category)
            )
        status_value = params.get('status')
        if status_value:
            qs = qs.filter(status=status_value.upper())
        if params.get('available') in ('1', 'true', 'yes'):
            qs = qs.filter(occupied_count__lt=F('capacity')).exclude(
                status__in=[Room.STATUS_MAINTENANCE, Room.STATUS_INACTIVE]
            )
        if params.get('hostel_only') in ('1', 'true', 'yes'):
            qs = qs.filter(room_purpose=Room.PURPOSE_HOSTEL, building__building_type=Building.TYPE_HOSTEL)
        q = params.get('q')
        if q:
            qs = qs.filter(Q(room_number__icontains=q) | Q(building__name__icontains=q))
        return qs.order_by('building__name', 'floor__floor_number', 'room_number')

    def perform_create(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'ROOM_CREATED', obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        services.recalculate_room_occupancy(obj)
        services.record_audit(self.request.user, 'ROOM_UPDATED', obj)

    def perform_destroy(self, instance):
        if RoomAllocation.objects.filter(room=instance, status=ALLOCATION_ACTIVE).exists():
            raise ValidationError({'detail': 'Cannot delete a room with active allocations.'})
        services.record_audit(self.request.user, 'ROOM_DELETED', instance)
        instance.delete()

    @action(detail=True, methods=['get'])
    def occupants(self, request, pk=None):
        room = self.get_object()
        qs = (
            RoomAllocation.objects.filter(room=room, status=ALLOCATION_ACTIVE)
            .select_related('student', 'student__user', 'bed')
        )
        return Response(
            {
                'room': RoomSerializer(room, context={'request': request}).data,
                'occupants': RoomAllocationSerializer(qs, many=True).data,
                'available_capacity': room.available_capacity,
            }
        )


class BedViewSet(viewsets.ModelViewSet):
    serializer_class = BedSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = Bed.objects.select_related('room', 'room__building')
        room = self.request.query_params.get('room')
        if room and str(room).isdigit():
            qs = qs.filter(room_id=int(room))
        return qs


class WardenAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = HostelWardenAssignmentSerializer
    permission_classes = [IsHostelAdmin]
    queryset = HostelWardenAssignment.objects.select_related('building', 'user').order_by('building__name')

    def get_queryset(self):
        qs = super().get_queryset()
        building = self.request.query_params.get('building')
        if building and str(building).isdigit():
            qs = qs.filter(building_id=int(building))
        if self.request.query_params.get('active') in ('1', 'true', 'yes'):
            qs = qs.filter(is_active=True)
        return qs


class AllocationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RoomAllocationSerializer
    permission_classes = [IsWardenOrHostelAdmin]

    def get_queryset(self):
        qs = RoomAllocation.objects.select_related(
            'student', 'student__user', 'room', 'room__building', 'room__floor', 'bed'
        )
        qs = _scope_to_warden_buildings(qs, self.request.user, field='room__building')
        params = self.request.query_params
        if params.get('room'):
            qs = qs.filter(room_id=params.get('room'))
        if params.get('building'):
            qs = qs.filter(room__building_id=params.get('building'))
        if params.get('student'):
            qs = qs.filter(student_id=params.get('student'))
        if params.get('reg_no'):
            qs = qs.filter(student__reg_no__iexact=params.get('reg_no'))
        gender_value = services.normalize_gender(params.get('gender') or params.get('sex') or '')
        if gender_value:
            qs = qs.filter(student__gender=gender_value)
        hostel_category = (params.get('hostel_category') or params.get('hostel_for') or '').upper()
        if hostel_category in (HOSTEL_CAT_BOYS, HOSTEL_CAT_GIRLS, HOSTEL_CAT_STAFF, HOSTEL_CAT_MIXED):
            qs = qs.filter(
                Q(room__hostel_category=hostel_category)
                | Q(room__hostel_category='', room__building__hostel_category=hostel_category)
            )
        status_value = params.get('status')
        if status_value:
            qs = qs.filter(status=status_value.upper())
        elif not params.get('include_history'):
            qs = qs.filter(status=ALLOCATION_ACTIVE)
        return qs.order_by('-start_date', '-id')

    def create(self, request, *args, **kwargs):
        payload = RoomAllocationCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        student = get_object_or_404(StudentProfile, pk=data['student'])
        room = get_object_or_404(Room, pk=data['room'])
        bed = get_object_or_404(Bed, pk=data['bed']) if data.get('bed') else None
        academic_year = get_object_or_404(AcademicYear, pk=data['academic_year']) if data.get('academic_year') else None

        # Gender-based allocation is compulsory. The client may capture the
        # gender at allocation time when it is missing on the student master
        # record, but an existing gender can never be silently overwritten.
        supplied_gender = services.normalize_gender(data.get('gender') or '')
        if data.get('gender') and not supplied_gender:
            raise ValidationError({'gender': 'Gender must be MALE, FEMALE or OTHER.'})
        if supplied_gender:
            current_gender = services.student_gender(student)
            if current_gender and current_gender != supplied_gender:
                raise ValidationError(
                    {'gender': 'The selected gender does not match the gender recorded on the student profile.'}
                )
            services.set_student_gender(student, supplied_gender)
            student.refresh_from_db(fields=['gender'])

        allocation = services.allocate_room(
            student=student,
            room=room,
            bed=bed,
            academic_year=academic_year,
            start_date=data.get('start_date'),
            expected_end_date=data.get('expected_end_date'),
            actor=request.user,
            remarks=data.get('remarks', ''),
        )
        return Response(RoomAllocationSerializer(allocation).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='auto')
    def auto_allocate(self, request):
        """Automatically allocate vacant, gender-matched rooms to selected Hostellers.

        The frontend sends the student profile ids selected with checkboxes.
        ``all_eligible=true`` allocates every Hosteller who is still waiting.
        """
        if not (is_hostel_admin(request.user) or is_warden(request.user)):
            return Response(
                {'detail': 'Warden or hostel administrator access is required.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = AutoAllocationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        buildings = Building.objects.filter(building_type=Building.TYPE_HOSTEL)
        if is_warden(request.user) and not is_hostel_admin(request.user):
            buildings = buildings.filter(id__in=warden_building_ids(request.user))
        if data.get('building'):
            buildings = buildings.filter(id=data['building'])
        if not buildings.exists():
            raise ValidationError({'building': 'No accessible hostel building found.'})

        student_qs = (
            StudentProfile.objects.select_related('user', 'hostel_facility')
            .filter(hostel_facility__residence_category=RESIDENCE_HOSTELLER)
            .exclude(hostel_allocations__status=ALLOCATION_ACTIVE)
        )
        if data.get('students'):
            student_qs = student_qs.filter(id__in=data['students'])
        elif not data.get('all_eligible'):
            raise ValidationError({'students': 'Select at least one student or set all_eligible=true.'})
        if data.get('gender'):
            student_qs = student_qs.filter(gender=data['gender'])

        students = list(student_qs.distinct().order_by('reg_no'))
        if not students:
            return Response(
                {
                    'requested': 0,
                    'allocated': 0,
                    'skipped': 0,
                    'allocations': [],
                    'errors': [{'reason': 'No eligible Hostellers are waiting for a room.'}],
                }
            )

        rooms = list(
            Room.objects.select_related('building', 'floor')
            .filter(room_purpose=Room.PURPOSE_HOSTEL, building__in=buildings)
            .exclude(status__in=[Room.STATUS_MAINTENANCE, Room.STATUS_INACTIVE])
            .order_by('occupied_count', 'building__code', 'room_number')
        )

        results = []
        errors = []
        for student in students:
            gender = services.normalize_gender(student.gender)
            if gender not in ('MALE', 'FEMALE', 'OTHER'):
                errors.append({
                    'student': student.id,
                    'reg_no': student.reg_no,
                    'reason': 'Gender is not set on the student profile.',
                })
                continue

            allocated = None
            last_error = ''
            for room in rooms:
                if int(room.capacity or 0) <= int(room.occupied_count or 0):
                    continue
                category = (room.hostel_category or room.building.hostel_category or '').upper()
                if category == 'BOYS' and gender != 'MALE':
                    continue
                if category == 'GIRLS' and gender != 'FEMALE':
                    continue
                if category == 'MIXED' and gender not in ('MALE', 'FEMALE', 'OTHER'):
                    continue
                if category not in ('BOYS', 'GIRLS', 'MIXED'):
                    continue

                active_bed_ids = RoomAllocation.objects.filter(
                    room=room, status=ALLOCATION_ACTIVE, bed__isnull=False
                ).values_list('bed_id', flat=True)
                bed = Bed.objects.filter(room=room, is_active=True).exclude(id__in=active_bed_ids).first()
                try:
                    allocated = services.allocate_room(
                        student=student,
                        room=room,
                        bed=bed,
                        start_date=data.get('start_date'),
                        expected_end_date=data.get('expected_end_date'),
                        actor=request.user,
                        remarks=data.get('remarks') or 'Automatic allocation.',
                    )
                except ValidationError as exc:
                    last_error = str(exc.detail if hasattr(exc, 'detail') else exc)
                    continue
                except Exception as exc:  # pragma: no cover - defensive
                    last_error = str(exc)
                    continue
                room.occupied_count = int(room.occupied_count or 0) + 1
                break

            if allocated is None:
                errors.append({
                    'student': student.id,
                    'reg_no': student.reg_no,
                    'reason': last_error or 'No vacant room matches this student\'s gender.',
                })
                continue

            results.append({
                'student': student.id,
                'reg_no': student.reg_no,
                'name': f'{student.user.first_name} {student.user.last_name}'.strip() or student.reg_no,
                'allocation': RoomAllocationSerializer(allocated).data,
            })
            services.record_audit(
                request.user,
                'ROOM_AUTO_ALLOCATED',
                allocated,
                {'student': student.reg_no, 'room': allocated.room_id},
            )

        return Response(
            {
                'requested': len(data.get('students') or students),
                'allocated': len(results),
                'skipped': len(errors),
                'allocations': results,
                'errors': errors,
            }
        )

    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None):
        allocation = self.get_object()
        payload = TransferAllocationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        new_room = get_object_or_404(Room, pk=data['new_room'])
        bed = get_object_or_404(Bed, pk=data['bed']) if data.get('bed') else None
        new_allocation = services.transfer_allocation(
            allocation=allocation,
            new_room=new_room,
            bed=bed,
            effective_date=data.get('effective_date'),
            actor=request.user,
            remarks=data.get('remarks', ''),
        )
        return Response(RoomAllocationSerializer(new_allocation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def vacate(self, request, pk=None):
        allocation = self.get_object()
        allocation = services.vacate_allocation(
            allocation=allocation,
            vacated_by=request.user,
            reason=request.data.get('reason', ''),
            end_date=request.data.get('end_date') or None,
        )
        return Response(RoomAllocationSerializer(allocation).data)


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------


class TransportRouteViewSet(viewsets.ModelViewSet):
    serializer_class = TransportRouteSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = TransportRoute.objects.prefetch_related('stops').annotate(
            bus_count=Count('buses', distinct=True),
        )
        if self.request.query_params.get('active') in ('1', 'true', 'yes'):
            qs = qs.filter(is_active=True)
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q))
        return qs.order_by('name')

    def perform_create(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'TRANSPORT_ROUTE_CREATED', obj)


class TransportStopViewSet(viewsets.ModelViewSet):
    serializer_class = TransportStopSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = TransportStop.objects.select_related('route')
        route = self.request.query_params.get('route')
        if route and str(route).isdigit():
            qs = qs.filter(route_id=int(route))
        return qs.order_by('route__name', 'sequence')


class CollegeBusViewSet(viewsets.ModelViewSet):
    serializer_class = CollegeBusSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = CollegeBus.objects.select_related('route')
        route = self.request.query_params.get('route')
        if route and str(route).isdigit():
            qs = qs.filter(route_id=int(route))
        if self.request.query_params.get('active') in ('1', 'true', 'yes'):
            qs = qs.filter(is_active=True)
        return qs.order_by('bus_number')

    def perform_create(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'COLLEGE_BUS_CREATED', obj)


class TransportAssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TransportAssignmentSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = TransportAssignment.objects.select_related('student', 'student__user', 'route', 'bus', 'stop')
        params = self.request.query_params
        if params.get('route'):
            qs = qs.filter(route_id=params.get('route'))
        if params.get('bus'):
            qs = qs.filter(bus_id=params.get('bus'))
        if params.get('stop'):
            qs = qs.filter(stop_id=params.get('stop'))
        if params.get('student'):
            qs = qs.filter(student_id=params.get('student'))
        if params.get('reg_no'):
            qs = qs.filter(student__reg_no__iexact=params.get('reg_no'))
        status_value = params.get('status')
        if status_value:
            qs = qs.filter(status=status_value.upper())
        return qs.order_by('-assigned_at')

    def create(self, request, *args, **kwargs):
        payload = TransportAssignmentCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        student = get_object_or_404(StudentProfile, pk=data['student'])
        route = get_object_or_404(TransportRoute, pk=data['route'])
        bus = get_object_or_404(CollegeBus, pk=data['bus']) if data.get('bus') else None
        stop = get_object_or_404(TransportStop, pk=data['stop']) if data.get('stop') else None
        academic_year = get_object_or_404(AcademicYear, pk=data['academic_year']) if data.get('academic_year') else None
        assignment = services.assign_transport(
            student=student,
            route=route,
            bus=bus,
            stop=stop,
            boarding_point=data.get('boarding_point', ''),
            academic_year=academic_year,
            actor=request.user,
            fee_amount=data.get('fee_amount'),
            replace=data.get('replace', True),
            remarks=data.get('remarks', ''),
        )
        return Response(TransportAssignmentSerializer(assignment).data, status=201)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        assignment = self.get_object()
        if assignment.status not in (TransportAssignment.STATUS_PENDING, TransportAssignment.STATUS_ACTIVE):
            raise ValidationError({'detail': 'Only pending or active assignments can be cancelled.'})
        assignment.status = TransportAssignment.STATUS_CANCELLED
        assignment.end_date = request.data.get('end_date') or timezone.localdate()
        if request.data.get('remarks'):
            assignment.remarks = (assignment.remarks + '\n' if assignment.remarks else '') + request.data['remarks']
        assignment.save()
        services.record_audit(request.user, 'TRANSPORT_CANCELLED', assignment)
        return Response(TransportAssignmentSerializer(assignment).data)


# ---------------------------------------------------------------------------
# Fees
# ---------------------------------------------------------------------------


class FeeStructureViewSet(viewsets.ModelViewSet):
    serializer_class = FeeStructureSerializer
    permission_classes = [IsHostelAdmin]
    queryset = FeeStructure.objects.select_related('building', 'route', 'academic_year').order_by('fee_type', 'name')

    def get_queryset(self):
        qs = super().get_queryset()
        fee_type = self.request.query_params.get('fee_type')
        if fee_type:
            qs = qs.filter(fee_type=fee_type.upper())
        if self.request.query_params.get('active') in ('1', 'true', 'yes'):
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'FEE_STRUCTURE_CREATED', obj)


class StudentFeeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StudentFeeSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = StudentFee.objects.select_related('student', 'student__user', 'fee_structure').prefetch_related('payments')
        params = self.request.query_params
        if params.get('student'):
            qs = qs.filter(student_id=params.get('student'))
        if params.get('reg_no'):
            qs = qs.filter(student__reg_no__iexact=params.get('reg_no'))
        if params.get('fee_structure'):
            qs = qs.filter(fee_structure_id=params.get('fee_structure'))
        status_value = params.get('status')
        if status_value:
            qs = qs.filter(status=status_value.upper())
        if params.get('outstanding') in ('1', 'true', 'yes'):
            qs = qs.exclude(status__in=[StudentFee.STATUS_PAID, StudentFee.STATUS_WAIVED])
        return qs.order_by('-due_date', '-id')

    def create(self, request, *args, **kwargs):
        payload = StudentFeeCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        student = get_object_or_404(StudentProfile, pk=data['student'])
        structure = get_object_or_404(FeeStructure, pk=data['fee_structure'])
        academic_year = get_object_or_404(AcademicYear, pk=data['academic_year']) if data.get('academic_year') else structure.academic_year
        if StudentFee.objects.filter(student=student, fee_structure=structure).exists():
            raise ValidationError({'fee_structure': 'This fee is already assigned to the student.'})
        fee = StudentFee.objects.create(
            student=student,
            fee_structure=structure,
            academic_year=academic_year,
            amount_due=data.get('amount_due') if data.get('amount_due') is not None else structure.amount,
            due_date=data.get('due_date') or structure.due_date,
            remarks=data.get('remarks', ''),
        )
        fee.recalculate()
        services.record_audit(request.user, 'STUDENT_FEE_CREATED', fee, {'student': student.reg_no})
        return Response(StudentFeeSerializer(fee).data, status=201)


class FeePaymentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = FeePaymentSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = FeePayment.objects.select_related('student_fee', 'student_fee__student', 'student_fee__student__user')
        params = self.request.query_params
        if params.get('student_fee'):
            qs = qs.filter(student_fee_id=params.get('student_fee'))
        if params.get('student'):
            qs = qs.filter(student_fee__student_id=params.get('student'))
        if params.get('from'):
            qs = qs.filter(paid_on__gte=params.get('from'))
        if params.get('to'):
            qs = qs.filter(paid_on__lte=params.get('to'))
        return qs.order_by('-paid_on', '-id')

    def create(self, request, *args, **kwargs):
        student_fee_id = request.data.get('student_fee')
        if not student_fee_id:
            raise ValidationError({'student_fee': 'Provide the student fee id.'})
        student_fee = get_object_or_404(StudentFee, pk=student_fee_id)
        payload = FeePaymentCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        payment = services.record_fee_payment(
            student_fee=student_fee,
            amount=data['amount'],
            actor=request.user,
            paid_on=data.get('paid_on') or timezone.localdate(),
            method=data.get('method', 'CASH'),
            reference_no=data.get('reference_no', ''),
            remarks=data.get('remarks', ''),
        )
        return Response(FeePaymentSerializer(payment).data, status=201)


# ---------------------------------------------------------------------------
# Complaints
# ---------------------------------------------------------------------------


class ComplaintViewSet(viewsets.ModelViewSet):
    serializer_class = ComplaintSerializer
    permission_classes = [IsHostelStaff]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Complaint.objects.select_related(
            'student', 'student__user', 'building', 'room', 'assigned_to'
        ).prefetch_related('history')
        qs = _scope_to_warden_buildings(qs, self.request.user, field='building')
        params = self.request.query_params
        if params.get('category'):
            qs = qs.filter(category=params['category'].upper())
        if params.get('priority'):
            qs = qs.filter(priority=params['priority'].upper())
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('building'):
            qs = qs.filter(building_id=params['building'])
        if params.get('room'):
            qs = qs.filter(room_id=params['room'])
        if params.get('assigned_to'):
            qs = qs.filter(assigned_to_id=params['assigned_to'])
        if params.get('q'):
            qs = qs.filter(
                Q(subject__icontains=params['q'])
                | Q(description__icontains=params['q'])
                | Q(ticket_no__icontains=params['q'])
            )
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        complaint = serializer.save()
        ComplaintStatusHistory.objects.create(
            complaint=complaint,
            status=complaint.status,
            note='Complaint created by staff.',
            changed_by=self.request.user,
        )
        services.record_audit(self.request.user, 'COMPLAINT_CREATED', complaint)

    @action(detail=True, methods=['post'])
    def status_update(self, request, pk=None):
        complaint = self.get_object()
        payload = ComplaintStatusUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        complaint = services.update_complaint_status(
            complaint=complaint,
            status_value=data['status'],
            actor=request.user,
            note=data.get('note', ''),
            resolution_notes=data.get('resolution_notes', ''),
        )
        return Response(ComplaintSerializer(complaint).data)

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        complaint = self.get_object()
        user_id = request.data.get('assigned_to')
        from django.contrib.auth import get_user_model

        assignee = get_object_or_404(get_user_model(), pk=user_id) if user_id else None
        complaint.assigned_to = assignee
        if complaint.status == Complaint.STATUS_OPEN and assignee is not None:
            complaint.status = Complaint.STATUS_ASSIGNED
        complaint.save()
        ComplaintStatusHistory.objects.create(
            complaint=complaint,
            status=complaint.status,
            note=f'Assigned to {assignee}' if assignee else 'Unassigned.',
            changed_by=request.user,
        )
        services.record_audit(request.user, 'COMPLAINT_ASSIGNED', complaint, {'assigned_to': user_id})
        return Response(ComplaintSerializer(complaint).data)


# ---------------------------------------------------------------------------
# Mess
# ---------------------------------------------------------------------------


class MessMenuViewSet(viewsets.ModelViewSet):
    serializer_class = MessMenuSerializer
    permission_classes = [IsHostelStaff]
    queryset = MessMenu.objects.select_related('building').order_by('-date', 'meal_type')

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('date'):
            qs = qs.filter(date=params['date'])
        if params.get('day_of_week') or params.get('day'):
            day = (params.get('day_of_week') or params.get('day') or '').upper()
            qs = qs.filter(day_of_week=day)
        if params.get('effective_date'):
            qs = qs.filter(effective_date=params['effective_date'])
        if params.get('from'):
            qs = qs.filter(date__gte=params['from'])
        if params.get('to'):
            qs = qs.filter(date__lte=params['to'])
        if params.get('building'):
            qs = qs.filter(building_id=params['building'])
        if params.get('meal_type'):
            qs = qs.filter(meal_type=params['meal_type'].upper())
        return qs

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        services.record_audit(self.request.user, 'MESS_MENU_CREATED', obj)


class MealBookingViewSet(viewsets.ModelViewSet):
    """Meal headcount bookings.

    Students operate their own rows through ``/me/mess/bookings/``; mess staff
    use this endpoint to read headcounts and correct bookings.
    """

    serializer_class = MealBookingSerializer
    permission_classes = [IsHostellerStudent]

    def get_queryset(self):
        qs = MealBooking.objects.select_related('student', 'student__user')
        user = self.request.user
        if not is_hostel_staff(user):
            student = services.get_student_profile_for_user(user)
            if student is None:
                return qs.none()
            qs = qs.filter(student=student)
        params = self.request.query_params
        if params.get('date'):
            qs = qs.filter(date=params['date'])
        if params.get('from'):
            qs = qs.filter(date__gte=params['from'])
        if params.get('to'):
            qs = qs.filter(date__lte=params['to'])
        if params.get('meal_type'):
            qs = qs.filter(meal_type=params['meal_type'].upper())
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        return qs.order_by('-date', 'meal_type')

    def perform_create(self, serializer):
        student = services.get_student_profile_for_user(self.request.user)
        if student is not None and not is_hostel_staff(self.request.user):
            serializer.save(student=student)
        else:
            serializer.save()

    @action(detail=False, methods=['get'])
    def headcount(self, request):
        """Opted-in counts per meal for a date (defaults to today)."""
        day = request.query_params.get('date') or timezone.localdate()
        rows = (
            MealBooking.objects.filter(date=day, is_opted_in=True)
            .values('meal_type')
            .annotate(count=Count('id'))
            .order_by('meal_type')
        )
        counts = {row['meal_type']: row['count'] for row in rows}
        return Response(
            {
                'date': day,
                'counts': {
                    meal: counts.get(meal, 0)
                    for meal, _label in MessMenu.MEAL_CHOICES
                },
                'total': sum(counts.values()),
            }
        )


class MessFeedbackViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MessFeedbackSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = MessFeedback.objects.select_related('student', 'student__user')
        params = self.request.query_params
        if params.get('date'):
            qs = qs.filter(date=params['date'])
        if params.get('from'):
            qs = qs.filter(date__gte=params['from'])
        if params.get('to'):
            qs = qs.filter(date__lte=params['to'])
        if params.get('meal_type'):
            qs = qs.filter(meal_type=params['meal_type'].upper())
        if params.get('category'):
            qs = qs.filter(category=params['category'].upper())
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        return qs.order_by('-date', '-id')

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self.get_queryset()
        aggregates = qs.aggregate(average=Avg('rating'), total=Count('id'))
        by_category = list(
            qs.values('category').annotate(count=Count('id'), average=Avg('rating')).order_by('category')
        )
        return Response(
            {
                'average_rating': round(float(aggregates['average'] or 0), 2),
                'total_feedback': aggregates['total'] or 0,
                'by_category': by_category,
            }
        )


class MessRequestViewSet(viewsets.ModelViewSet):
    serializer_class = MessRequestSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = MessRequest.objects.select_related('student', 'student__user', 'reviewed_by')
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(status=MessRequest.STATUS_PENDING)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        obj = self.get_object()
        approve = str(request.data.get('approve', '')).lower() in ('1', 'true', 'yes')
        obj.status = MessRequest.STATUS_APPROVED if approve else MessRequest.STATUS_REJECTED
        obj.reviewed_by = request.user
        obj.reviewed_at = timezone.now()
        obj.remarks = request.data.get('remarks', '')
        obj.save()
        services.record_audit(request.user, 'MESS_REQUEST_REVIEWED', obj, {'approve': approve})
        return Response(MessRequestSerializer(obj).data)


# ---------------------------------------------------------------------------
# Visitors, leave & movement
# ---------------------------------------------------------------------------


class VisitorViewSet(viewsets.ModelViewSet):
    serializer_class = VisitorSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = Visitor.objects.select_related('student', 'student__user', 'building', 'room', 'logged_by')
        qs = _scope_to_warden_buildings(qs, self.request.user, field='building')
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('active') in ('1', 'true', 'yes'):
            qs = qs.filter(status=Visitor.STATUS_CHECKED_IN)
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        if params.get('building'):
            qs = qs.filter(building_id=params['building'])
        if params.get('date'):
            qs = qs.filter(entry_at__date=params['date'])
        if params.get('q'):
            qs = qs.filter(
                Q(visitor_name__icontains=params['q'])
                | Q(phone_number__icontains=params['q'])
                | Q(student__reg_no__icontains=params['q'])
            )
        return qs.order_by('-entry_at')

    def perform_create(self, serializer):
        student = serializer.validated_data.get('student')
        building = serializer.validated_data.get('building')
        room = serializer.validated_data.get('room')
        if student is not None and building is None:
            allocation = (
                RoomAllocation.objects.filter(student=student, status=ALLOCATION_ACTIVE)
                .select_related('room')
                .first()
            )
            if allocation is not None:
                building = allocation.room.building
                room = room or allocation.room
        obj = serializer.save(
            approved_by=self.request.user,
            logged_by=self.request.user,
            building=building,
            room=room,
        )
        services.record_audit(self.request.user, 'VISITOR_CHECKED_IN', obj)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        today = timezone.localdate()
        scoped = _scope_to_warden_buildings(Visitor.objects.all(), request.user, field='building')
        return Response(
            {
                'active': scoped.filter(status=Visitor.STATUS_CHECKED_IN).count(),
                'checked_out_today': scoped.filter(
                    status=Visitor.STATUS_CHECKED_OUT, exit_at__date=today
                ).count(),
                'today_total': scoped.filter(entry_at__date=today).count(),
            }
        )

    @action(detail=True, methods=['post'])
    def checkout(self, request, pk=None):
        visitor = self.get_object()
        visitor.exit_at = timezone.now()
        visitor.status = Visitor.STATUS_CHECKED_OUT
        visitor.save(update_fields=['exit_at', 'status', 'updated_at'])
        services.record_audit(request.user, 'VISITOR_CHECKED_OUT', visitor)
        return Response(VisitorSerializer(visitor).data)


class GatePassViewSet(viewsets.ModelViewSet):
    """Warden approval queue + security gate verification.

    Student self-service lives on ``MyGatePassesView``. This viewset is the
    operational console for wardens, hostel admins and security staff.
    """

    serializer_class = GatePassSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = (
            GatePass.objects.select_related(
                'student', 'student__user', 'approved_by',
                'security_guard_out', 'security_guard_in',
            )
            .all()
        )
        user = self.request.user
        if not is_hostel_staff(user):
            student = services.get_student_profile_for_user(user)
            qs = qs.filter(student=student) if student is not None else qs.none()
        elif is_warden(user) and not is_hostel_admin(user):
            building_ids = warden_building_ids(user)
            qs = qs.filter(
                student__hostel_allocations__status=ALLOCATION_ACTIVE,
                student__hostel_allocations__room__building_id__in=building_ids,
            ).distinct()
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('pass_type'):
            qs = qs.filter(pass_type=params['pass_type'].upper())
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        if params.get('late') in ('1', 'true', 'yes'):
            qs = qs.filter(is_late_entry=True)
        if params.get('q'):
            qs = qs.filter(
                Q(student__reg_no__icontains=params['q'])
                | Q(student__user__first_name__icontains=params['q'])
                | Q(student__user__last_name__icontains=params['q'])
                | Q(qr_token__icontains=params['q'])
            )
        return qs.order_by('-from_date', '-id')

    def create(self, request, *args, **kwargs):
        if not is_hostel_staff(request.user):
            raise ValidationError({'detail': 'Use the student movement hub to submit a pass request.'})
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(status=GatePass.STATUS_PENDING)
        services.record_audit(request.user, 'GATE_PASS_CREATED', obj)
        return Response(self.get_serializer(obj).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if not is_hostel_staff(request.user):
            return Response({'detail': 'Hostel staff access is required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_hostel_admin(request.user):
            return Response({'detail': 'Hostel administrator access is required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def decision(self, request, pk=None):
        if not (is_hostel_admin(request.user) or is_warden(request.user)):
            return Response({'detail': 'Warden access is required.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object()
        if obj.status != GatePass.STATUS_PENDING:
            raise ValidationError({'detail': 'Only pending passes can be approved or rejected.'})
        approve = str(request.data.get('approve', '')).lower() in ('1', 'true', 'yes')
        obj.status = GatePass.STATUS_APPROVED if approve else GatePass.STATUS_REJECTED
        obj.approved_by = request.user
        obj.approved_at = timezone.now()
        obj.warden_remarks = request.data.get('warden_remarks', request.data.get('remarks', ''))
        obj.save(update_fields=['status', 'approved_by', 'approved_at', 'warden_remarks', 'updated_at'])
        services.record_audit(request.user, 'GATE_PASS_REVIEWED', obj, {'approve': approve})
        return Response(self.get_serializer(obj).data)

    @action(detail=False, methods=['post'], url_path='from-application')
    def from_application(self, request):
        """Import an approved legacy gate-pass application into the unified log."""
        if not is_hostel_staff(request.user):
            return Response({'detail': 'Hostel staff access is required.'}, status=status.HTTP_403_FORBIDDEN)
        from applications import models as app_models
        from applications.services.gatepass_utils import extract_gate_date, is_gatepass_application

        application_id = request.data.get('application') or request.data.get('application_id')
        application = app_models.Application.objects.filter(pk=application_id).first()
        if application is None:
            raise ValidationError({'application': 'Application not found.'})
        if not is_gatepass_application(application):
            raise ValidationError({'application': 'This application is not a gate pass.'})
        if application.current_state != app_models.Application.ApplicationState.APPROVED and application.status != 'APPROVED':
            raise ValidationError({'application': 'Only approved gate pass applications can be imported.'})
        student = application.student_profile or getattr(application.applicant_user, 'student_profile', None)
        if student is None:
            raise ValidationError({'application': 'The application has no linked student profile.'})
        existing = GatePass.objects.filter(application=application).first()
        if existing is not None:
            return Response(self.get_serializer(existing).data)

        values = {}
        for row in application.data.select_related('field').all():
            key = str(getattr(row.field, 'field_key', '') or '').lower()
            label = str(getattr(row.field, 'label', '') or getattr(row.field, 'name', '') or '').lower()
            if isinstance(row.value, (str, int, float)):
                values[key or label] = str(row.value)

        def _find(*needles):
            for key, value in values.items():
                if any(needle in key for needle in needles):
                    return value
            return ''

        day = extract_gate_date(application) or (timezone.localdate() + timedelta(days=1))
        start = timezone.make_aware(datetime.combine(day, time(8, 0)))
        end = timezone.make_aware(datetime.combine(day, time(20, 0)))
        obj = GatePass.objects.create(
            student=student,
            application=application,
            pass_type=GatePass.PASS_LOCAL_OUTING,
            from_date=day,
            to_date=day,
            expected_out_time=start,
            expected_in_time=end,
            reason=_find('reason', 'purpose') or 'Imported gate pass application',
            destination=_find('place', 'destination', 'address'),
            guardian_contact=_find('contact', 'phone', 'mobile'),
            status=GatePass.STATUS_APPROVED,
            approved_by=request.user,
            approved_at=timezone.now(),
            warden_remarks='Imported from approved application.',
        )
        services.record_audit(request.user, 'GATE_PASS_IMPORTED', obj, {'application': application.pk})
        return Response(self.get_serializer(obj).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='scan')
    def scan(self, request):
        if not _can_operate_gate(request.user):
            return Response({'detail': 'Security gate access is required.'}, status=status.HTTP_403_FORBIDDEN)
        token = str(request.data.get('token') or request.data.get('qr_token') or '').strip()
        if not token:
            raise ValidationError({'token': 'Provide the pass token.'})
        obj = (
            GatePass.objects.select_related('student', 'student__user')
            .filter(Q(qr_token__iexact=token) | Q(student__reg_no__iexact=token))
            .order_by('-id')
            .first()
        )
        if obj is None:
            return Response({'valid': False, 'detail': 'No pass found for this token.'}, status=404)
        return Response(
            {
                'valid': obj.is_valid_at_gate,
                'pass': self.get_serializer(obj).data,
            }
        )

    @action(detail=False, methods=['post'], url_path='verify-exit')
    def verify_exit(self, request):
        if not _can_operate_gate(request.user):
            return Response({'detail': 'Security gate access is required.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self._resolve_pass(request)
        if obj.status != GatePass.STATUS_APPROVED:
            return Response(
                {'detail': f'Pass is {obj.get_status_display().lower()} and cannot be used.', 'pass': self.get_serializer(obj).data},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if obj.is_expired:
            return Response(
                {'detail': 'Pass has expired.', 'pass': self.get_serializer(obj).data},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if obj.actual_out_time:
            raise ValidationError({'detail': 'Exit was already recorded for this pass.'})
        obj.actual_out_time = timezone.now()
        obj.security_guard_out = request.user
        obj.save(update_fields=['actual_out_time', 'security_guard_out', 'updated_at'])
        if obj.application_id:
            obj.application.gatepass_scanned_at = obj.actual_out_time
            obj.application.gatepass_scanned_by = request.user
            obj.application.save(update_fields=['gatepass_scanned_at', 'gatepass_scanned_by'])
        services.record_audit(request.user, 'GATE_PASS_EXIT', obj)
        return Response({'detail': 'Exit recorded.', 'pass': self.get_serializer(obj).data})

    @action(detail=False, methods=['post'], url_path='verify-entry')
    def verify_entry(self, request):
        if not _can_operate_gate(request.user):
            return Response({'detail': 'Security gate access is required.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self._resolve_pass(request)
        if obj.actual_out_time is None:
            raise ValidationError({'detail': 'The student has no recorded exit for this pass.'})
        if obj.actual_in_time:
            raise ValidationError({'detail': 'Entry was already recorded for this pass.'})
        now = timezone.now()
        obj.actual_in_time = now
        obj.security_guard_in = request.user
        obj.is_late_entry = now > obj.expected_in_time
        obj.status = GatePass.STATUS_COMPLETED
        obj.save(
            update_fields=[
                'actual_in_time', 'security_guard_in', 'is_late_entry', 'status', 'updated_at',
            ]
        )
        if obj.is_late_entry:
            LateEntry.objects.create(
                student=obj.student,
                date=timezone.localdate(now),
                expected_time=timezone.localtime(obj.expected_in_time).time(),
                actual_time=timezone.localtime(now).time(),
                reason=f'Late return against gate pass #{obj.pk}.',
                approved_by=request.user,
                status=LateEntry.STATUS_PENDING,
            )
        if obj.leave_request_id and obj.leave_request.status == StudentLeaveRequest.STATUS_APPROVED:
            obj.leave_request.status = StudentLeaveRequest.STATUS_COMPLETED
            obj.leave_request.save(update_fields=['status', 'updated_at'])
        if obj.application_id:
            obj.application.gatepass_in_scanned_at = now
            obj.application.gatepass_in_scanned_by = request.user
            obj.application.save(update_fields=['gatepass_in_scanned_at', 'gatepass_in_scanned_by'])
        services.record_audit(request.user, 'GATE_PASS_ENTRY', obj, {'late': obj.is_late_entry})
        return Response(
            {
                'detail': 'Late entry flagged.' if obj.is_late_entry else 'Entry recorded.',
                'is_late_entry': obj.is_late_entry,
                'pass': self.get_serializer(obj).data,
            }
        )

    def _resolve_pass(self, request):
        token = str(request.data.get('token') or request.data.get('qr_token') or '').strip()
        pass_id = request.data.get('pass') or request.data.get('pass_id')
        qs = GatePass.objects.select_related('student', 'student__user', 'approved_by', 'leave_request')
        if pass_id:
            qs = qs.filter(pk=pass_id)
        elif token:
            qs = qs.filter(Q(qr_token__iexact=token) | Q(student__reg_no__iexact=token))
        else:
            raise ValidationError({'token': 'Provide the pass id or QR token.'})
        obj = qs.order_by('-id').first()
        if obj is None:
            raise ValidationError({'token': 'Gate pass not found.'})
        return obj


class AnnouncementViewSet(viewsets.ModelViewSet):
    """Warden / admin broadcast manager with priority and audience targeting."""

    serializer_class = AnnouncementSerializer
    permission_classes = [IsHostelStaff]

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsHostelStaff()]
        return [IsWardenOrHostelAdmin()]

    def get_queryset(self):
        qs = HostelNotice.objects.select_related('building', 'created_by').prefetch_related('reads')
        params = self.request.query_params
        if params.get('priority'):
            qs = qs.filter(priority=params['priority'].upper())
        if params.get('audience'):
            qs = qs.filter(audience=params['audience'].upper())
        if params.get('building'):
            qs = qs.filter(building_id=params['building'])
        if params.get('q'):
            qs = qs.filter(Q(title__icontains=params['q']) | Q(body__icontains=params['q']))
        return qs.order_by('-published_at')

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        services.record_audit(self.request.user, 'ANNOUNCEMENT_PUBLISHED', obj)


def _can_operate_gate(user) -> bool:
    if is_hostel_admin(user) or is_warden(user):
        return True
    from .permissions import user_role_names

    return bool(user_role_names(user) & {'SECURITY', 'SECURITY_STAFF', 'SECURITY STAFF', 'SECURITYSTAFF'})


class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = StudentLeaveRequestSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = StudentLeaveRequest.objects.select_related('student', 'student__user', 'approved_by')
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        if params.get('from'):
            qs = qs.filter(from_date__gte=params['from'])
        return qs.order_by('-from_date', '-id')

    def perform_create(self, serializer):
        serializer.save(status=StudentLeaveRequest.STATUS_PENDING)

    @action(detail=True, methods=['post'])
    def decision(self, request, pk=None):
        obj = self.get_object()
        approve = str(request.data.get('approve', '')).lower() in ('1', 'true', 'yes')
        obj.status = StudentLeaveRequest.STATUS_APPROVED if approve else StudentLeaveRequest.STATUS_REJECTED
        obj.approved_by = request.user
        obj.approved_at = timezone.now()
        obj.remarks = request.data.get('remarks', '')
        obj.save()
        if approve and not GatePass.objects.filter(leave_request=obj).exists():
            start = timezone.make_aware(datetime.combine(obj.from_date, time(6, 0)))
            end = timezone.make_aware(datetime.combine(obj.to_date, time(22, 0)))
            pass_type = {
                StudentLeaveRequest.LEAVE_HOME: GatePass.PASS_HOME_LEAVE,
                StudentLeaveRequest.LEAVE_MEDICAL: GatePass.PASS_EMERGENCY,
            }.get(obj.leave_type, GatePass.PASS_LOCAL_OUTING)
            GatePass.objects.create(
                student=obj.student,
                leave_request=obj,
                pass_type=pass_type,
                from_date=obj.from_date,
                to_date=obj.to_date,
                expected_out_time=start,
                expected_in_time=end,
                reason=obj.reason,
                destination=obj.destination,
                guardian_contact=obj.guardian_contact,
                status=GatePass.STATUS_APPROVED,
                approved_by=request.user,
                approved_at=timezone.now(),
                warden_remarks=obj.remarks,
            )
        services.record_audit(request.user, 'LEAVE_REVIEWED', obj, {'approve': approve})
        return Response(StudentLeaveRequestSerializer(obj).data)


class LateEntryViewSet(viewsets.ModelViewSet):
    serializer_class = LateEntrySerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = LateEntry.objects.select_related('student', 'student__user', 'approved_by')
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        if params.get('date'):
            qs = qs.filter(date=params['date'])
        return qs.order_by('-date', '-id')

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        obj = self.get_object()
        approve = str(request.data.get('approve', '')).lower() in ('1', 'true', 'yes')
        obj.status = LateEntry.STATUS_APPROVED if approve else LateEntry.STATUS_REJECTED
        obj.approved_by = request.user
        obj.remarks = request.data.get('remarks', '')
        obj.save()
        services.record_audit(request.user, 'LATE_ENTRY_REVIEWED', obj, {'approve': approve})
        return Response(LateEntrySerializer(obj).data)


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


class AssetViewSet(viewsets.ModelViewSet):
    serializer_class = AssetSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = Asset.objects.select_related('building', 'floor', 'room', 'custodian').prefetch_related('maintenance_logs')
        qs = _scope_to_warden_buildings(qs, self.request.user, field='building')
        params = self.request.query_params
        if params.get('building') or params.get('hostel_block'):
            qs = qs.filter(building_id=params.get('building') or params.get('hostel_block'))
        if params.get('room'):
            qs = qs.filter(room_id=params['room'])
        if params.get('condition'):
            qs = qs.filter(condition=params['condition'].upper())
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('category'):
            qs = qs.filter(category=params['category'].upper())
        if params.get('q'):
            qs = qs.filter(
                Q(name__icontains=params['q'])
                | Q(asset_code__icontains=params['q'])
                | Q(room__room_number__icontains=params['q'])
            )
        return qs.order_by('asset_code')

    def perform_create(self, serializer):
        obj = serializer.save()
        services.record_audit(self.request.user, 'ASSET_CREATED', obj)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self.get_queryset()
        by_status = {
            row['status']: row['count']
            for row in qs.values('status').annotate(count=Count('id'))
        }
        by_category = {
            row['category']: row['count']
            for row in qs.values('category').annotate(count=Count('id'))
        }
        totals = qs.aggregate(total_cost=Sum('cost'), total_quantity=Sum('quantity'))
        return Response(
            {
                'total_assets': qs.count(),
                'good': by_status.get(Asset.STATUS_GOOD, 0),
                'needs_repair': by_status.get(Asset.STATUS_NEEDS_REPAIR, 0),
                'damaged': by_status.get(Asset.STATUS_DAMAGED, 0),
                'disposed': by_status.get(Asset.STATUS_DISPOSED, 0),
                'by_category': by_category,
                'total_cost': str(totals['total_cost'] or 0),
                'total_quantity': totals['total_quantity'] or 0,
            }
        )

    @action(detail=True, methods=['post'], url_path='status')
    def set_status(self, request, pk=None):
        obj = self.get_object()
        value = str(request.data.get('status', '')).upper()
        if value not in dict(Asset.STATUS_CHOICES):
            raise ValidationError({'status': 'Invalid asset status.'})
        obj.status = value
        obj.save(update_fields=['status', 'condition', 'updated_at'])
        services.record_audit(request.user, 'ASSET_STATUS_CHANGED', obj, {'status': value})
        return Response(AssetSerializer(obj).data)

    @action(detail=True, methods=['post'])
    def maintenance(self, request, pk=None):
        asset = self.get_object()
        serializer = AssetMaintenanceLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        log = serializer.save(asset=asset, performed_by=request.user)
        if log.status == AssetMaintenanceLog.STATUS_COMPLETED:
            asset.status = Asset.STATUS_GOOD
        else:
            asset.status = Asset.STATUS_NEEDS_REPAIR
        asset.save(update_fields=['status', 'condition', 'updated_at'])
        services.record_audit(request.user, 'ASSET_MAINTENANCE_LOGGED', asset, {'log': log.pk})
        return Response(AssetMaintenanceLogSerializer(log).data, status=201)


class AssetMaintenanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AssetMaintenanceLogSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = AssetMaintenanceLog.objects.select_related('asset')
        qs = _scope_to_warden_buildings(qs, self.request.user, field='asset__building')
        asset = self.request.query_params.get('asset')
        if asset:
            qs = qs.filter(asset_id=asset)
        return qs.order_by('-performed_at')


# ---------------------------------------------------------------------------
# Notices
# ---------------------------------------------------------------------------


class HostelNoticeViewSet(viewsets.ModelViewSet):
    serializer_class = HostelNoticeSerializer
    permission_classes = [IsHostelStaff]

    def get_queryset(self):
        qs = HostelNotice.objects.select_related('building', 'created_by').prefetch_related('reads')
        params = self.request.query_params
        if params.get('notice_type'):
            qs = qs.filter(notice_type=params['notice_type'].upper())
        if params.get('audience'):
            qs = qs.filter(audience=params['audience'].upper())
        if params.get('building'):
            qs = qs.filter(building_id=params['building'])
        if params.get('live') in ('1', 'true', 'yes'):
            now = timezone.now()
            qs = qs.filter(is_active=True, published_at__lte=now).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gte=now)
            )
        return qs.order_by('-is_emergency', '-published_at')

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        services.record_audit(self.request.user, 'NOTICE_PUBLISHED', obj)


# ---------------------------------------------------------------------------
# Vacating & clearance
# ---------------------------------------------------------------------------


class VacatingRequestViewSet(viewsets.ModelViewSet):
    serializer_class = VacatingRequestSerializer
    permission_classes = [IsWardenOrHostelAdmin]

    def get_queryset(self):
        qs = VacatingRequest.objects.select_related(
            'student', 'student__user', 'allocation', 'allocation__room'
        ).prefetch_related('clearances')
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        return qs.order_by('-created_at')

    def create(self, request, *args, **kwargs):
        student_id = request.data.get('student')
        student = get_object_or_404(StudentProfile, pk=student_id) if student_id else None
        if student is None:
            raise ValidationError({'student': 'Provide the student id.'})
        obj = services.create_vacating_request(
            student=student,
            requested_vacate_date=request.data.get('requested_vacate_date') or None,
            reason=request.data.get('reason', ''),
        )
        return Response(VacatingRequestSerializer(obj).data, status=201)

    @action(detail=True, methods=['post'])
    def verify_step(self, request, pk=None):
        obj = self.get_object()
        payload = VacatingStepSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        obj = services.verify_vacating_step(
            request_obj=obj,
            step=data['step'],
            actor=request.user,
            approve=data.get('approve', True),
            notes=data.get('notes', ''),
        )
        ClearanceRecord.objects.get_or_create(
            vacating_request=obj,
            clearance_type={
                'room': ClearanceRecord.TYPE_ROOM,
                'assets': ClearanceRecord.TYPE_ASSET,
                'dues': ClearanceRecord.TYPE_FEE,
            }[data['step']],
            defaults={'status': ClearanceRecord.STATUS_CLEARED, 'cleared_by': request.user, 'cleared_at': timezone.now()},
        )
        return Response(VacatingRequestSerializer(obj).data)

    @action(detail=True, methods=['post'])
    def decision(self, request, pk=None):
        obj = self.get_object()
        payload = VacatingDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        obj = services.approve_vacating_request(
            request_obj=obj,
            actor=request.user,
            approve=data['approve'],
            remarks=data.get('remarks', ''),
        )
        return Response(VacatingRequestSerializer(obj).data)


# ---------------------------------------------------------------------------
# Reports & audit
# ---------------------------------------------------------------------------


class OccupancyReportView(APIView):
    permission_classes = [IsHostelStaff]

    def get(self, request):
        rooms = Room.objects.select_related('building', 'floor').filter(
            building__building_type=Building.TYPE_HOSTEL
        )
        building = request.query_params.get('building')
        if building:
            rooms = rooms.filter(building_id=building) if str(building).isdigit() else rooms.filter(
                building__code__iexact=building
            )
        rows = []
        for room in rooms.order_by('building__name', 'floor__floor_number', 'room_number'):
            rows.append(
                {
                    'building': room.building.name,
                    'building_code': room.building.code,
                    'floor': room.floor.floor_number,
                    'room_number': room.room_number,
                    'room_type': room.room_type,
                    'capacity': room.capacity,
                    'occupied': room.occupied_count,
                    'available': room.available_capacity,
                    'status': room.status,
                }
            )
        totals = rooms.aggregate(capacity=Sum('capacity'))
        occupied = RoomAllocation.objects.filter(
            status=ALLOCATION_ACTIVE, room__in=rooms
        ).count()
        return Response(
            {
                'totals': {
                    'rooms': rooms.count(),
                    'capacity': int(totals['capacity'] or 0),
                    'occupied': occupied,
                    'available': max(int(totals['capacity'] or 0) - occupied, 0),
                },
                'rooms': rows,
            }
        )


class FeeReportView(APIView):
    permission_classes = [IsHostelStaff]

    def get(self, request):
        qs = StudentFee.objects.select_related('fee_structure', 'student', 'student__user')
        params = request.query_params
        if params.get('fee_type'):
            qs = qs.filter(fee_structure__fee_type=params['fee_type'].upper())
        if params.get('status'):
            qs = qs.filter(status=params['status'].upper())
        if params.get('from'):
            qs = qs.filter(due_date__gte=params['from'])
        if params.get('to'):
            qs = qs.filter(due_date__lte=params['to'])

        by_type = list(
            qs.values('fee_structure__fee_type')
            .annotate(
                records=Count('id'),
                due=Sum('amount_due'),
                paid=Sum('amount_paid'),
            )
            .order_by('fee_structure__fee_type')
        )
        for row in by_type:
            row['outstanding'] = str((row['due'] or Decimal('0')) - (row['paid'] or Decimal('0')))

        totals = qs.aggregate(due=Sum('amount_due'), paid=Sum('amount_paid'))
        return Response(
            {
                'totals': {
                    'records': qs.count(),
                    'due': str(totals['due'] or 0),
                    'paid': str(totals['paid'] or 0),
                    'outstanding': str((totals['due'] or Decimal('0')) - (totals['paid'] or Decimal('0'))),
                },
                'by_fee_type': by_type,
            }
        )


class TransportReportView(APIView):
    permission_classes = [IsHostelStaff]

    def get(self, request):
        data = list(
            TransportRoute.objects.annotate(
                assigned=Count(
                    'assignments',
                    filter=Q(assignments__status__in=['PENDING', 'ACTIVE']),
                    distinct=True,
                ),
                buses=Count('buses', distinct=True),
            )
            .values('id', 'code', 'name', 'fee_amount', 'assigned', 'buses')
            .order_by('name')
        )
        return Response({'routes': data, 'total_bus_users': sum(row['assigned'] for row in data)})


class ComplaintReportView(APIView):
    permission_classes = [IsHostelStaff]

    def get(self, request):
        qs = Complaint.objects.all()
        params = request.query_params
        if params.get('from'):
            qs = qs.filter(created_at__date__gte=params['from'])
        if params.get('to'):
            qs = qs.filter(created_at__date__lte=params['to'])
        by_status = list(qs.values('status').annotate(total=Count('id')).order_by('status'))
        by_category = list(qs.values('category').annotate(total=Count('id')).order_by('category'))
        return Response(
            {
                'total': qs.count(),
                'by_status': by_status,
                'by_category': by_category,
                'resolved': qs.filter(status__in=[Complaint.STATUS_RESOLVED, Complaint.STATUS_CLOSED]).count(),
            }
        )


class AuditLogView(APIView):
    permission_classes = [IsHostelAdmin]

    def get(self, request):
        qs = HostelAuditLog.objects.select_related('user').order_by('-created_at')
        if request.query_params.get('action'):
            qs = qs.filter(action=request.query_params['action'])
        if request.query_params.get('model'):
            qs = qs.filter(model_name=request.query_params['model'])
        return _paginate(request, qs, HostelAuditLogSerializer)


class LookupView(APIView):
    """Small lookup payload used by hostel forms."""

    permission_classes = [IsHostelStaff]

    def get(self, request):
        buildings = Building.objects.filter(status=Building.STATUS_ACTIVE).order_by('name')
        return Response(
            {
                'buildings': [
                    {
                        'id': b.id,
                        'code': b.code,
                        'name': b.name,
                        'building_type': b.building_type,
                        'hostel_category': b.hostel_category,
                        'is_hostel': b.is_hostel,
                    }
                    for b in buildings
                ],
                'residence_categories': [
                    {'value': code, 'label': label} for code, label in RESIDENCE_CATEGORY_CHOICES
                ],
                'hostel_categories': [
                    {'value': code, 'label': label} for code, label in HOSTEL_CATEGORY_CHOICES
                ],
                'genders': [
                    {'value': 'MALE', 'label': 'Male'},
                    {'value': 'FEMALE', 'label': 'Female'},
                    {'value': 'OTHER', 'label': 'Other'},
                ],
                'room_types': [{'value': code, 'label': label} for code, label in Room.TYPE_CHOICES],
                'room_statuses': [{'value': code, 'label': label} for code, label in Room.STATUS_CHOICES],
                'complaint_categories': [
                    {'value': code, 'label': label} for code, label in Complaint.CATEGORY_CHOICES
                ],
                'complaint_priorities': [
                    {'value': code, 'label': label} for code, label in Complaint.PRIORITY_CHOICES
                ],
                'fee_types': [{'value': code, 'label': label} for code, label in FeeStructure.FEE_TYPE_CHOICES],
                'academic_years': [
                    {'id': y.id, 'name': str(y), 'is_active': y.is_active}
                    for y in AcademicYear.objects.order_by('-name')[:50]
                ],
                'selection_state': services.selection_window_state(),
            }
        )
