from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from applications import models as app_models
from applications.serializers import (
    ApplicationCreateSerializer,
    ApplicationListSerializer,
    ApplicationDetailSerializer,
    ApprovalActionSerializer,
)
from applications.serializers.application import _extract_time_window, _is_gatepass_application
from applications.services import approval_engine
from applications.services import approver_resolver
from applications.services import access_control
from applications.services import application_state as app_state_svc
from applications.serializers.approval import ApplicationApprovalHistorySerializer

User = get_user_model()


def _resolve_application_department(application: app_models.Application):
    if application is None:
        return None

    staff = getattr(application, 'staff_profile', None)
    if staff is not None and getattr(staff, 'department', None) is not None:
        return staff.department

    student = getattr(application, 'student_profile', None)
    try:
        if student is not None and student.section is not None:
            return student.section.batch.course.department
    except Exception:
        return None

    return None


def _get_role_assignees(role, department=None):
    """Return displayable info for all active users holding `role`.

    When department is provided, restrict to users whose StaffProfile belongs
    to that department.
    """
    assignees = User.objects.filter(roles=role, is_active=True)
    if department is not None:
        assignees = assignees.filter(staff_profile__department=department)
    assignees = assignees.order_by('username')
    result = []
    for u in assignees:
        name = (f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip()
                or u.username)
        staff_profile = getattr(u, 'staff_profile', None)
        staff_id = getattr(staff_profile, 'staff_id', None) if staff_profile is not None else None
        payload = {'id': u.id, 'name': name, 'username': u.username}
        if staff_id:
            payload['staff_id'] = staff_id
        result.append(payload)
    return result


def _get_step_assignees(application: app_models.Application, step: app_models.ApprovalStep):
    """Resolve concrete assignee(s) for a step.

    Prefer a single concrete approver when it can be resolved via the academic
    authority mappings (mentor map / department role etc). Fallback to listing
    all active users who explicitly hold the role.
    """
    if application is None or step is None:
        return []

    # If step targets a stage, aggregate assignees from pinned users and each role in the stage.
    if getattr(step, 'stage_id', None):
        assignees: list[dict] = []
        seen_user_ids: set[int] = set()

        try:
            pinned = (
                app_models.ApplicationRoleHierarchyStageUser.objects
                .filter(stage_id=step.stage_id)
                .select_related('user')
            )
            for row in pinned:
                u = row.user
                if u is None or not getattr(u, 'is_active', True):
                    continue
                if getattr(u, 'id', None) in seen_user_ids:
                    continue
                name = (f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip() or getattr(u, 'username', '') or str(u))
                payload = {'id': u.id, 'name': name, 'username': getattr(u, 'username', None)}
                staff_profile = getattr(u, 'staff_profile', None)
                staff_id = getattr(staff_profile, 'staff_id', None) if staff_profile is not None else None
                if staff_id:
                    payload['staff_id'] = staff_id
                assignees.append(payload)
                seen_user_ids.add(u.id)
        except Exception:
            pass

        try:
            role_ids = (
                app_models.ApplicationRoleHierarchyStageRole.objects
                .filter(stage_id=step.stage_id)
                .values_list('role_id', flat=True)
                .distinct()
            )
            roles = list(Role.objects.filter(id__in=list(role_ids)))

            class _StepLike:
                def __init__(self, role):
                    self.role = role

            for role in roles:
                # Reuse existing resolver logic for each role.
                for row in _get_step_assignees(application, _StepLike(role)):
                    uid = row.get('id')
                    if uid and uid in seen_user_ids:
                        continue
                    if uid:
                        seen_user_ids.add(uid)
                    assignees.append(row)
        except Exception:
            pass

        return assignees

    if step.role is None:
        return []

    try:
        resolved = approver_resolver.resolve_current_approver(application, step)
    except Exception:
        resolved = None

    if resolved is not None:
        u = resolved
        name = (f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip()
                or u.username)
        staff_profile = getattr(u, 'staff_profile', None)
        staff_id = getattr(staff_profile, 'staff_id', None) if staff_profile is not None else None
        payload = {'id': u.id, 'name': name, 'username': u.username}
        if staff_id:
            payload['staff_id'] = staff_id
        return [payload]

    role_code = (getattr(step.role, 'name', '') or '').strip().upper()
    if role_code in ('HOD', 'AHOD'):
        dept = _resolve_application_department(application)
        return _get_role_assignees(step.role, department=dept)

    return _get_role_assignees(step.role)


def _forwarded_to_payload(application):
    """Return forwarded_to dict based on the application's current step."""
    step = approval_engine.get_current_approval_step(application)
    if step is None:
        return None
    label = None
    if getattr(step, 'stage_id', None):
        label = getattr(step.stage, 'name', None)
    elif getattr(step, 'role_id', None):
        label = step.role.name

    if not label:
        return None
    return {
        'role_name': label,
        'step_order': step.order,
        'is_final': step.is_final,
        'assignees': _get_step_assignees(application, step),
    }


class CreateApplicationView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        serializer = ApplicationCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        application = serializer.save()
        return Response({'id': application.id, 'status': application.status}, status=status.HTTP_201_CREATED)


class MyApplicationsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        qs = (
            app_models.Application.objects
            .filter(
                Q(applicant_user=request.user)
                | Q(student_profile__user=request.user)
                | Q(staff_profile__user=request.user)
            )
            .distinct()
            .order_by('-created_at')
        )
        serializer = ApplicationListSerializer(qs, many=True)
        return Response(serializer.data)


class PendingApplicationsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        # For now, consider only SUBMITTED applications
        candidates = app_models.Application.objects.filter(status=app_models.Application.Status.SUBMITTED).order_by('-created_at')
        pending = []
        for app in candidates:
            if approval_engine.user_can_act(app, request.user):
                pending.append(app)

        serializer = ApplicationListSerializer(pending, many=True)
        return Response(serializer.data)


class ApplicationDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)

        # Centralized access control
        if not access_control.can_user_view_application(application, request.user):
            return Response({'detail': 'Not authorized to view this application'}, status=status.HTTP_403_FORBIDDEN)

        serializer = ApplicationDetailSerializer(application)
        return Response(serializer.data)


class ApplicationApproveView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)
        remarks = request.data.get('remarks')

        with transaction.atomic():
            try:
                updated = approval_engine.process_approval(application, request.user, 'APPROVE', remarks=remarks)
            except Exception as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'id': updated.id, 'status': updated.status})


class ApplicationRejectView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)
        remarks = request.data.get('remarks')

        with transaction.atomic():
            try:
                updated = approval_engine.process_approval(application, request.user, 'REJECT', remarks=remarks)
            except Exception as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'id': updated.id, 'status': updated.status})


class ApplicationCancelView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)

        # Only applicant can cancel (enforced again in service)
        if application.applicant_user_id != request.user.id:
            return Response({'detail': 'Not authorized to cancel this application'}, status=status.HTTP_403_FORBIDDEN)

        # Only allow cancelling active/running applications
        if application.current_state in (
            app_models.Application.ApplicationState.APPROVED,
            app_models.Application.ApplicationState.REJECTED,
            app_models.Application.ApplicationState.CANCELLED,
        ):
            return Response({'detail': 'Application cannot be cancelled in its current state.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            updated = app_state_svc.cancel_application(application, request.user)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'id': updated.id, 'current_state': updated.current_state, 'status': updated.status})


class ApplicationApprovalHistoryView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)

        # Centralized access control for viewing history
        if not access_control.can_user_view_application(application, request.user):
            return Response({'detail': 'Not authorized to view approval history'}, status=403)

        # Build actions queryset ordered chronologically (created/acted_at asc)
        actions_qs = application.actions.select_related('acted_by', 'step__role').prefetch_related('acted_by__roles').order_by('acted_at')

        timeline = ApplicationApprovalHistorySerializer(actions_qs, many=True).data

        return Response({
            'application_id': application.id,
            'application_type': application.application_type.name if application.application_type else None,
            'current_state': application.current_state,
            'timeline': timeline,
        })


class CreateAndSubmitView(APIView):
    """POST /api/applications/create-and-submit/
    Creates, saves data, submits, and auto-advances step 1 if submitter role
    matches step 1 role (e.g. STUDENT self-approval).
    Returns forwarded_to info so the UI can show the success popup.
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        application_type_id = request.data.get('application_type_id')
        data = request.data.get('data') or {}

        if not application_type_id:
            return Response({'detail': 'application_type_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            app_type = app_models.ApplicationType.objects.get(pk=application_type_id, is_active=True)
        except app_models.ApplicationType.DoesNotExist:
            return Response({'detail': 'Application type not found or inactive'}, status=status.HTTP_404_NOT_FOUND)

        if not isinstance(data, dict):
            return Response({'detail': 'data must be a JSON object'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate fields against ApplicationField definitions
        fields_qs = list(app_models.ApplicationField.objects.filter(application_type=app_type))
        fields_map = {f.field_key: f for f in fields_qs}
        expected_keys = set(fields_map.keys())
        required_keys = {f.field_key for f in fields_qs if f.is_required}
        provided_keys = set(data.keys())

        missing = required_keys - provided_keys
        if missing:
            return Response({'detail': f'Missing required fields: {", ".join(sorted(missing))}'}, status=status.HTTP_400_BAD_REQUEST)
        unknown = provided_keys - expected_keys
        if unknown:
            return Response({'detail': f'Unknown fields: {", ".join(sorted(unknown))}'}, status=status.HTTP_400_BAD_REQUEST)

        # ── SLA cooldown: block resubmission within cooldown window ─────────
        # Use a temporary app object to resolve the flow (no DB write yet).
        _temp = app_models.Application(
            application_type=app_type,
            applicant_user=request.user,
        )
        try:
            _pre_flow = approval_engine._get_flow_for_application(_temp)
        except Exception:
            _pre_flow = None
        if _pre_flow and _pre_flow.sla_hours:
            from datetime import timedelta
            _recent = app_models.Application.objects.filter(
                applicant_user=request.user,
                application_type=app_type,
                current_state__in=['APPROVED', 'REJECTED'],
                final_decision_at__isnull=False,
            ).order_by('-final_decision_at').first()
            if _recent and _recent.final_decision_at:
                _cooldown_until = _recent.final_decision_at + timedelta(hours=_pre_flow.sla_hours)
                _now = timezone.now()
                
                # Check for gatepass expiry exception
                _is_expired_gp = False
                if _is_gatepass_application(_recent):
                    _win = _extract_time_window(_recent)
                    if _win and _now > _win['end']:
                        _is_expired_gp = True

                if _now < _cooldown_until and not _is_expired_gp:
                    _remaining = _cooldown_until - _now
                    _hrs = int(_remaining.total_seconds() // 3600)
                    _mins = int((_remaining.total_seconds() % 3600) // 60)

                    return Response({
                        'detail': (
                            f'Cannot submit another \'{app_type.name}\' for {_hrs}h {_mins}m '
                            f'(cooldown until {_cooldown_until.strftime("%I:%M %p, %d %b %Y")}).'
                        ),
                        'cooldown': True,
                        'cooldown_until': _cooldown_until.isoformat(),
                        'cooldown_remaining_seconds': int(_remaining.total_seconds()),
                    }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # ── Active-application block: prevent duplicate submissions ──────────
        # Non-terminal states: DRAFT, SUBMITTED, IN_REVIEW
        _TERMINAL_STATES = [
            app_models.Application.ApplicationState.APPROVED,
            app_models.Application.ApplicationState.REJECTED,
            app_models.Application.ApplicationState.CANCELLED,
        ]
        _active_app = app_models.Application.objects.filter(
            applicant_user=request.user,
            application_type=app_type,
        ).exclude(current_state__in=_TERMINAL_STATES).order_by('-created_at').first()
        if _active_app:
            # If the "active" application is a GATEPASS that has exceeded its window, treat it as expired (terminal).
            _is_expired_active = False
            if _is_gatepass_application(_active_app):
                _win = _extract_time_window(_active_app)
                # Check valid window end against now
                if _win and timezone.now() > _win['end']:
                    _is_expired_active = True

            if not _is_expired_active:
                return Response(
                    {
                        'detail': (
                            f'You already have a pending {app_type.name} application '
                            f'(#{_active_app.pk}) that is currently {_active_app.get_current_state_display()}. '
                            f'You can only submit a new one after it is fully approved or rejected.'
                        ),
                        'active_application_id': _active_app.pk,
                        'active_application_state': _active_app.current_state,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        with transaction.atomic():
            # Attach applicant profile so department selection + authority resolvers
            # (e.g. MENTOR via StudentMentorMap) can work deterministically.
            student_profile = None
            staff_profile = None
            try:
                student_profile = getattr(request.user, 'student_profile', None)
            except Exception:
                student_profile = None
            try:
                staff_profile = getattr(request.user, 'staff_profile', None)
            except Exception:
                staff_profile = None

            if student_profile is not None and not getattr(student_profile, 'pk', None):
                student_profile = None
            if staff_profile is not None and not getattr(staff_profile, 'pk', None):
                staff_profile = None

            # Enforce starter-role access: only the first-step role can initiate.
            temp_app = app_models.Application(
                application_type=app_type,
                applicant_user=request.user,
                student_profile=student_profile,
                staff_profile=staff_profile,
            )
            flow = approval_engine._get_flow_for_application(temp_app)
            if not flow:
                return Response({'detail': 'No active approval flow configured for this application type.'}, status=status.HTTP_400_BAD_REQUEST)
            starter_step = flow.steps.select_related('role', 'stage').order_by('order').first()
            if starter_step is None:
                return Response({'detail': 'Approval flow has no steps configured.'}, status=status.HTTP_400_BAD_REQUEST)

            starter_label = None
            starter_roles = []
            allowed = False
            user_roles = list(request.user.roles.all())
            
            if getattr(starter_step, 'stage_id', None):
                starter_label = getattr(starter_step.stage, 'name', None)
                
                # Check if user is explicitly pinned to this stage
                try:
                    if app_models.ApplicationRoleHierarchyStageUser.objects.filter(
                        stage_id=starter_step.stage_id, user=request.user
                    ).exists():
                        allowed = True
                except Exception:
                    pass
                
                role_ids = (
                    app_models.ApplicationRoleHierarchyStageRole.objects
                    .filter(stage_id=starter_step.stage_id)
                    .values_list('role_id', flat=True)
                    .distinct()
                )
                starter_roles = list(Role.objects.filter(id__in=list(role_ids)))
            elif getattr(starter_step, 'role_id', None):
                starter_label = getattr(starter_step.role, 'name', None)
                starter_roles = [starter_step.role]

            if not starter_roles and not allowed:
                return Response({'detail': 'Approval flow has no starter role configured.'}, status=status.HTTP_400_BAD_REQUEST)

            if not allowed:
                for role in starter_roles:
                    role_name = (getattr(role, 'name', '') or '').strip().upper()
                    if not role_name:
                        continue
                    if role in user_roles:
                        allowed = True
                        break
                    if role_name == 'STUDENT' and student_profile is not None:
                        allowed = True
                        break
                    if role_name == 'STAFF' and staff_profile is not None:
                        allowed = True
                        break

            if not allowed:
                return Response({'detail': f'Only {starter_label or "starter role"} can create this application.'}, status=status.HTTP_403_FORBIDDEN)

            application = app_models.Application.objects.create(
                application_type=app_type,
                applicant_user=request.user,
                student_profile=student_profile,
                staff_profile=staff_profile,
                current_state=app_models.Application.ApplicationState.DRAFT,
                status=app_models.Application.ApplicationState.DRAFT,
            )

            # Persist field data
            rows = [
                app_models.ApplicationData(application=application, field=fields_map[key], value=val)
                for key, val in data.items()
                if key in fields_map
            ]
            if rows:
                app_models.ApplicationData.objects.bulk_create(rows)

            # Submit (DRAFT → IN_REVIEW, binds flow & form version)
            try:
                application = app_state_svc.submit_application(application, request.user)
            except Exception as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            # Auto-advance step 1 if user matches the step (role or stage)
            step1 = approval_engine.get_current_approval_step(application)
            should_auto_advance = False
            
            if step1:
                # 1. Direct role match
                if getattr(step1, 'role', None) and step1.role in user_roles:
                    should_auto_advance = True
                # 2. Stage match (temporary/UI roles)
                elif getattr(step1, 'stage_id', None):
                    if app_models.ApplicationRoleHierarchyStageUser.objects.filter(
                        stage_id=step1.stage_id, user=request.user
                    ).exists():
                        should_auto_advance = True
                    else:
                        role_ids = app_models.ApplicationRoleHierarchyStageRole.objects.filter(
                            stage_id=step1.stage_id
                        ).values_list('role_id', flat=True).distinct()
                        if any(r.id in role_ids for r in user_roles):
                            should_auto_advance = True

            if should_auto_advance:
                try:
                    application = approval_engine.process_approval(application, request.user, 'APPROVE')
                except Exception:
                    pass  # stay at step 1 if auto-advance fails

        application = app_models.Application.objects.get(pk=application.pk)
        return Response({
            'id': application.id,
            'current_state': application.current_state,
            'forwarded_to': _forwarded_to_payload(application),
        }, status=status.HTTP_201_CREATED)


class ApplicationActionView(APIView):
    """POST /api/applications/<id>/action/
    Body: { action: "FORWARD" | "REJECT", remarks: "" }
    FORWARD maps to process_approval APPROVE (works for both mid-flow and final step).
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)
        action = (request.data.get('action') or '').strip().upper()
        remarks = request.data.get('remarks') or ''

        if action not in ('FORWARD', 'REJECT'):
            return Response({'detail': 'action must be FORWARD or REJECT'}, status=status.HTTP_400_BAD_REQUEST)

        engine_action = 'APPROVE' if action == 'FORWARD' else 'REJECT'

        try:
            updated = approval_engine.process_approval(application, request.user, engine_action, remarks=remarks)
        except PermissionDenied as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        forwarded_to = (
            _forwarded_to_payload(updated)
            if updated.current_state == app_models.Application.ApplicationState.IN_REVIEW
            else None
        )
        return Response({
            'id': updated.id,
            'current_state': updated.current_state,
            'forwarded_to': forwarded_to,
        })


class ApplicationStepInfoView(APIView):
    """GET /api/applications/<id>/step-info/
    Returns current step, next step, whether user can act, and the forward button label.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)

        if not access_control.can_user_view_application(application, request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        can_act = approval_engine.user_can_act(application, request.user)
        current_step = approval_engine.get_current_approval_step(application)
        next_step = (
            approval_engine.get_next_approval_step(application, current_step)
            if current_step else None
        )

        current_step_data = None
        next_step_data = None
        forward_label = 'Forward'
        is_final = False

        if current_step:
            is_final = current_step.is_final

            current_label = ''
            if getattr(current_step, 'stage_id', None):
                current_label = getattr(current_step.stage, 'name', '') or ''
            elif getattr(current_step, 'role_id', None):
                current_label = current_step.role.name if current_step.role else ''

            current_step_data = {
                'order': current_step.order,
                'role_name': current_label,
                'is_final': is_final,
            }

            next_label = ''
            if next_step:
                if getattr(next_step, 'stage_id', None):
                    next_label = getattr(next_step.stage, 'name', '') or ''
                elif getattr(next_step, 'role_id', None):
                    next_label = next_step.role.name if next_step.role else ''

                next_step_data = {
                    'order': next_step.order,
                    'role_name': next_label,
                }

            if is_final:
                forward_label = 'Approve'
            elif next_label:
                forward_label = f'Forward to {next_label}'

        return Response({
            'can_act': can_act,
            'current_step': current_step_data,
            'next_step': next_step_data,
            'is_final_step': is_final,
            'forward_label': forward_label,
            'current_state': application.current_state,
        })
