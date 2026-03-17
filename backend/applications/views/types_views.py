from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from applications import models as app_models
from applications.serializers.types import (
    ApplicationTypeListSerializer,
    ApplicationTypeSchemaSerializer,
)
from applications.services import flow_selection


def _get_user_department(user):
    staff = None
    student = None
    try:
        staff = getattr(user, 'staff_profile', None)
    except Exception:
        staff = None
    try:
        student = getattr(user, 'student_profile', None)
    except Exception:
        student = None

    if staff is not None:
        try:
            dept = staff.current_department
        except Exception:
            dept = getattr(staff, 'department', None)
        if dept is not None:
            return dept

    if student is not None:
        # Prefer section's course department
        try:
            sec = getattr(student, 'section', None)
            if sec and getattr(sec, 'batch', None) and getattr(sec.batch, 'course', None):
                dept = sec.batch.course.department
                if dept is not None:
                    return dept
        except Exception:
            pass

        # Fallback: permanent home department
        try:
            dept = getattr(student, 'home_department', None)
            if dept is not None:
                return dept
        except Exception:
            pass

    return None


def _user_can_initiate_type(user, app_type: app_models.ApplicationType) -> bool:
    if user is None or not getattr(user, 'is_authenticated', False) or app_type is None:
        return False

    dept = _get_user_department(user)

    flows = app_models.ApprovalFlow.objects.filter(application_type=app_type, is_active=True)
    flows = flows.filter(steps__isnull=False).distinct()

    # Prefer a flow whose starter role matches the user's effective/last role.
    flow = None
    if dept is not None:
        dept_flow = flow_selection.select_best_initiable_flow(flows.filter(department=dept), user)
        if dept_flow is not None:
            flow = dept_flow

    if flow is None:
        global_flow = flow_selection.select_best_initiable_flow(flows.filter(department__isnull=True), user)
        if global_flow is not None:
            flow = global_flow

    if flow is None:
        return False

    first_step = flow.steps.select_related('role').order_by('order').first()
    if first_step is None or first_step.role is None:
        return False

    role_name = str(getattr(first_step.role, 'name', '') or '').strip().upper()
    if not role_name:
        return False

    # Primary check: user's logical role memberships
    try:
        if user.roles.filter(name__iexact=role_name).exists():
            return True
    except Exception:
        pass

    # Fallback: if starter is STUDENT/STAFF, allow by presence of profile
    if role_name == 'STUDENT':
        try:
            return getattr(user, 'student_profile', None) is not None
        except Exception:
            return False
    if role_name == 'STAFF':
        try:
            return getattr(user, 'staff_profile', None) is not None
        except Exception:
            return False

    return False


class ApplicationTypeListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        qs = app_models.ApplicationType.objects.filter(is_active=True).order_by('name')
        allowed = [t for t in qs if _user_can_initiate_type(request.user, t)]
        serializer = ApplicationTypeListSerializer(allowed, many=True)
        return Response(serializer.data)


class ApplicationTypeSchemaView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=id, is_active=True)

        if not _user_can_initiate_type(request.user, app_type):
            return Response({'detail': 'Not authorized to create this application type.'}, status=status.HTTP_403_FORBIDDEN)

        # fields for this application type
        fields_qs = app_models.ApplicationField.objects.filter(application_type=app_type).order_by('order')

        # active form version if any (prefer is_active, fallback to latest)
        active_form = app_models.ApplicationFormVersion.objects.filter(application_type=app_type, is_active=True).order_by('-version').first()
        if not active_form:
            active_form = app_models.ApplicationFormVersion.objects.filter(application_type=app_type).order_by('-version').first()

        payload = {
            'id': app_type.id,
            'name': app_type.name,
            'code': app_type.code,
            'description': app_type.description,
            'fields': fields_qs,
            'active_form': active_form,
            'role_permissions': app_type.role_permissions.all(),
        }

        serializer = ApplicationTypeSchemaSerializer(payload)
        return Response(serializer.data, status=status.HTTP_200_OK)
