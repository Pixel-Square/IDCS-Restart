from typing import Any

from django.db import transaction
from django.db.models import Count, Prefetch, Q, ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from applications import models as app_models
from applications.services import application_state


def _is_iqac(user) -> bool:
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    try:
        return user.roles.filter(name__iexact='IQAC').exists()
    except Exception:
        return False


class IsIQAC(BasePermission):
    message = 'IQAC access required.'

    def has_permission(self, request, view):
        return _is_iqac(getattr(request, 'user', None))


class IQACOnlyAPIView(APIView):
    permission_classes = (IsAuthenticated, IsIQAC)


def _field_payload(field: app_models.ApplicationField) -> dict[str, Any]:
    return {
        'id': field.id,
        'application_type_id': field.application_type_id,
        'field_key': field.field_key,
        'label': field.label,
        'field_type': field.field_type,
        'is_required': field.is_required,
        'order': field.order,
        'meta': field.meta or {},
    }


def _role_permission_payload(row: app_models.RoleApplicationPermission) -> dict[str, Any]:
    return {
        'id': row.id,
        'role_id': row.role_id,
        'role_name': getattr(row.role, 'name', None),
        'can_edit_all': row.can_edit_all,
        'can_override_flow': row.can_override_flow,
    }


def _role_hierarchy_payload(row: app_models.ApplicationRoleHierarchy) -> dict[str, Any]:
    return {
        'id': row.id,
        'role_id': row.role_id,
        'role_name': getattr(row.role, 'name', None),
        'rank': row.rank,
    }


def _step_payload(step: app_models.ApprovalStep) -> dict[str, Any]:
    return {
        'id': step.id,
        'order': step.order,
        'role_id': step.role_id,
        'role_name': getattr(step.role, 'name', None),
        'stage_id': getattr(step, 'stage_id', None),
        'stage_name': getattr(step.stage, 'name', None) if getattr(step, 'stage_id', None) else None,
        'sla_hours': step.sla_hours,
        'escalate_to_role_id': step.escalate_to_role_id,
        'escalate_to_role_name': getattr(step.escalate_to_role, 'name', None) if step.escalate_to_role_id else None,
        'is_final': bool(getattr(step, 'is_final', False)),
        'can_override': step.can_override,
        'auto_skip_if_unavailable': step.auto_skip_if_unavailable,
    }


def _validate_flow_final_step_rules(flow: app_models.ApprovalFlow) -> tuple[bool, str]:
    """Return (ok, message) ensuring the flow has a single final step and that it is the last step."""
    steps = list(flow.steps.all().order_by('order'))
    if not steps:
        return False, 'Approval flow has no steps.'

    finals = [s for s in steps if getattr(s, 'is_final', False)]
    if len(finals) != 1:
        return False, 'Approval flow must have exactly one final step.'

    final_step = finals[0]
    if final_step.order != steps[-1].order:
        return False, 'Final step must be the last step in the flow.'

    if final_step.escalate_to_role_id:
        return False, 'Final step cannot have an escalation role.'

    return True, ''


def _validate_step_rules(step_flow: app_models.ApprovalFlow, *, step_id: int | None, is_final: bool, escalate_to_role_id: Any) -> tuple[bool, dict[str, Any]]:
    """Validate per-step constraints; returns (ok, error_payload)."""
    errors: dict[str, Any] = {}

    if is_final:
        if escalate_to_role_id not in (None, '', 0, '0'):
            errors['escalate_to_role_id'] = 'Final step cannot have escalate_to_role_id.'

        other_final_qs = step_flow.steps.filter(is_final=True)
        if step_id is not None:
            other_final_qs = other_final_qs.exclude(pk=step_id)
        if other_final_qs.exists():
            errors['is_final'] = 'Only one final step is allowed per flow.'

    if errors:
        return False, {'errors': errors}
    return True, {}


def _flow_payload(flow: app_models.ApprovalFlow) -> dict[str, Any]:
    steps = [
        _step_payload(step)
        for step in flow.steps.select_related('role', 'stage', 'escalate_to_role').order_by('order')
    ]
    return {
        'id': flow.id,
        'application_type_id': flow.application_type_id,
        'department_id': flow.department_id,
        'department_name': getattr(flow.department, 'name', None) if flow.department_id else None,
        'is_active': flow.is_active,
        'sla_hours': flow.sla_hours,
        'override_roles': [
            {'id': role.id, 'name': role.name}
            for role in flow.override_roles.all().order_by('name')
        ],
        'steps': steps,
    }


def _version_payload(version: app_models.ApplicationFormVersion) -> dict[str, Any]:
    return {
        'id': version.id,
        'application_type_id': version.application_type_id,
        'version': version.version,
        'schema': version.schema or {},
        'is_active': version.is_active,
        'created_at': version.created_at,
    }


def _application_type_payload(app_type: app_models.ApplicationType) -> dict[str, Any]:
    active_form = getattr(app_type, 'active_form_version', None)
    field_count = getattr(app_type, 'field_count', None)
    submission_count = getattr(app_type, 'submission_count', None)
    has_active_flow = getattr(app_type, 'has_active_flow', None)
    return {
        'id': app_type.id,
        'name': app_type.name,
        'code': app_type.code,
        'description': app_type.description,
        'is_active': app_type.is_active,
        'field_count': int(field_count or 0),
        'submission_count': int(submission_count or 0),
        'active_form_version': active_form.version if active_form else None,
        'active_form_version_id': active_form.id if active_form else None,
        'has_active_flow': bool(has_active_flow),
    }


class ApplicationsAdminOverviewView(IQACOnlyAPIView):
    def get(self, request, *args, **kwargs):
        types_qs = app_models.ApplicationType.objects.all()
        flows_qs = app_models.ApprovalFlow.objects.filter(is_active=True)
        versions_qs = app_models.ApplicationFormVersion.objects.all()

        type_ids_with_fields = set(app_models.ApplicationField.objects.values_list('application_type_id', flat=True).distinct())
        type_ids_with_active_versions = set(versions_qs.filter(is_active=True).values_list('application_type_id', flat=True).distinct())
        type_ids_with_active_flows = set(flows_qs.values_list('application_type_id', flat=True).distinct())

        warnings = []
        for app_type in types_qs.order_by('name'):
            if app_type.id in type_ids_with_fields and app_type.id not in type_ids_with_active_versions:
                warnings.append({
                    'type_id': app_type.id,
                    'type_name': app_type.name,
                    'message': 'Fields exist but no active schema version is published.',
                })
            if app_type.is_active and app_type.id not in type_ids_with_active_flows:
                warnings.append({
                    'type_id': app_type.id,
                    'type_name': app_type.name,
                    'message': 'Active application type has no active approval flow.',
                })

        return Response({
            'summary': {
                'application_types': types_qs.count(),
                'active_application_types': types_qs.filter(is_active=True).count(),
                'active_flows': flows_qs.count(),
                'schema_versions': versions_qs.count(),
                'active_schema_versions': versions_qs.filter(is_active=True).count(),
                'submissions': app_models.Application.objects.count(),
                'role_permissions': app_models.RoleApplicationPermission.objects.count(),
            },
            'warnings': warnings[:20],
        })


class ApplicationsAdminRolesView(IQACOnlyAPIView):
    def get(self, request, *args, **kwargs):
        roles = Role.objects.order_by('name')
        return Response([
            {'id': role.id, 'name': role.name, 'description': role.description}
            for role in roles
        ])


class ApplicationsAdminTypeListCreateView(IQACOnlyAPIView):
    def get(self, request, *args, **kwargs):
        active_forms = {
            version.application_type_id: version
            for version in app_models.ApplicationFormVersion.objects.filter(is_active=True)
        }
        active_flow_ids = set(
            app_models.ApprovalFlow.objects.filter(is_active=True).values_list('application_type_id', flat=True)
        )
        qs = app_models.ApplicationType.objects.annotate(
            field_count=Count('fields', distinct=True),
            submission_count=Count('applications', distinct=True),
        ).order_by('name')

        rows = []
        for app_type in qs:
            app_type.active_form_version = active_forms.get(app_type.id)
            app_type.has_active_flow = app_type.id in active_flow_ids
            rows.append(_application_type_payload(app_type))
        return Response(rows)

    def post(self, request, *args, **kwargs):
        name = StringOrEmpty(request.data.get('name'))
        code = StringOrEmpty(request.data.get('code')).upper()
        description = StringOrEmpty(request.data.get('description'))
        is_active = bool(request.data.get('is_active', True))

        errors = {}
        if not name:
            errors['name'] = 'Name is required.'
        if not code:
            errors['code'] = 'Code is required.'
        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        if app_models.ApplicationType.objects.filter(code__iexact=code).exists():
            return Response({'errors': {'code': 'Application type code already exists.'}}, status=status.HTTP_400_BAD_REQUEST)

        app_type = app_models.ApplicationType.objects.create(
            name=name,
            code=code,
            description=description,
            is_active=is_active,
        )
        return Response(_application_type_payload(app_type), status=status.HTTP_201_CREATED)


def StringOrEmpty(value: Any) -> str:
    return str(value or '').strip()


class ApplicationsAdminTypeDetailView(IQACOnlyAPIView):
    def patch(self, request, id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=id)
        name = request.data.get('name', app_type.name)
        code = StringOrEmpty(request.data.get('code', app_type.code)).upper()
        description = request.data.get('description', app_type.description)
        is_active = request.data.get('is_active', app_type.is_active)

        errors = {}
        if not StringOrEmpty(name):
            errors['name'] = 'Name is required.'
        if not code:
            errors['code'] = 'Code is required.'
        dup = app_models.ApplicationType.objects.filter(code__iexact=code).exclude(pk=app_type.pk)
        if dup.exists():
            errors['code'] = 'Application type code already exists.'
        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        app_type.name = StringOrEmpty(name)
        app_type.code = code
        app_type.description = str(description or '').strip()
        app_type.is_active = bool(is_active)
        app_type.save(update_fields=['name', 'code', 'description', 'is_active'])
        return Response(_application_type_payload(app_type))


class ApplicationsAdminFieldListCreateView(IQACOnlyAPIView):
    def get(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        fields = app_models.ApplicationField.objects.filter(application_type=app_type).order_by('order', 'field_key')
        return Response([_field_payload(field) for field in fields])

    def post(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        field_key = StringOrEmpty(request.data.get('field_key'))
        label = StringOrEmpty(request.data.get('label'))
        field_type = StringOrEmpty(request.data.get('field_type')).upper()
        is_required = bool(request.data.get('is_required', False))
        meta = request.data.get('meta') or {}
        order = request.data.get('order')

        errors = {}
        if not field_key:
            errors['field_key'] = 'Field key is required.'
        if not label:
            errors['label'] = 'Label is required.'
        valid_types = {choice for choice, _ in app_models.ApplicationField.FieldType.choices}
        if field_type not in valid_types:
            errors['field_type'] = 'Invalid field type.'
        if not isinstance(meta, dict):
            errors['meta'] = 'Meta must be an object.'
        if app_models.ApplicationField.objects.filter(application_type=app_type, field_key=field_key).exists():
            errors['field_key'] = 'Field key already exists for this application type.'
        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        if order is None:
            max_order = app_models.ApplicationField.objects.filter(application_type=app_type).aggregate(max_order=Count('id'))
            order = int(app_models.ApplicationField.objects.filter(application_type=app_type).count()) + 1

        field = app_models.ApplicationField.objects.create(
            application_type=app_type,
            field_key=field_key,
            label=label,
            field_type=field_type,
            is_required=is_required,
            order=int(order),
            meta=meta,
        )
        return Response(_field_payload(field), status=status.HTTP_201_CREATED)


class ApplicationsAdminFieldDetailView(IQACOnlyAPIView):
    def patch(self, request, id: int, *args, **kwargs):
        field = get_object_or_404(app_models.ApplicationField, pk=id)

        field_key = StringOrEmpty(request.data.get('field_key', field.field_key))
        label = StringOrEmpty(request.data.get('label', field.label))
        field_type = StringOrEmpty(request.data.get('field_type', field.field_type)).upper()
        meta = request.data.get('meta', field.meta or {})
        errors = {}
        valid_types = {choice for choice, _ in app_models.ApplicationField.FieldType.choices}

        if not field_key:
            errors['field_key'] = 'Field key is required.'
        if not label:
            errors['label'] = 'Label is required.'
        if field_type not in valid_types:
            errors['field_type'] = 'Invalid field type.'
        if not isinstance(meta, dict):
            errors['meta'] = 'Meta must be an object.'
        if app_models.ApplicationField.objects.filter(application_type=field.application_type, field_key=field_key).exclude(pk=field.pk).exists():
            errors['field_key'] = 'Field key already exists for this application type.'
        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        field.field_key = field_key
        field.label = label
        field.field_type = field_type
        field.is_required = bool(request.data.get('is_required', field.is_required))
        field.order = int(request.data.get('order', field.order))
        field.meta = meta
        field.save(update_fields=['field_key', 'label', 'field_type', 'is_required', 'order', 'meta'])
        return Response(_field_payload(field))

    def delete(self, request, id: int, *args, **kwargs):
        field = get_object_or_404(app_models.ApplicationField, pk=id)
        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ApplicationsAdminFieldReorderView(IQACOnlyAPIView):
    def post(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        ordered_ids = request.data.get('field_ids') or []
        if not isinstance(ordered_ids, list):
            return Response({'detail': 'field_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        fields = list(app_models.ApplicationField.objects.filter(application_type=app_type))
        fields_by_id = {field.id: field for field in fields}
        if set(fields_by_id.keys()) != {int(field_id) for field_id in ordered_ids if str(field_id).isdigit()}:
            return Response({'detail': 'field_ids must contain all fields for this type exactly once.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for idx, field_id in enumerate(ordered_ids, start=1):
                field = fields_by_id[int(field_id)]
                if field.order != idx:
                    field.order = idx
                    field.save(update_fields=['order'])

        updated = app_models.ApplicationField.objects.filter(application_type=app_type).order_by('order', 'field_key')
        return Response([_field_payload(field) for field in updated])


class ApplicationsAdminVersionListCreateView(IQACOnlyAPIView):
    def get(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        versions = app_models.ApplicationFormVersion.objects.filter(application_type=app_type).order_by('-version')
        return Response([_version_payload(version) for version in versions])

    def post(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        version = application_state._snapshot_schema_for_application_type(app_type)
        return Response(_version_payload(version), status=status.HTTP_201_CREATED)


class ApplicationsAdminVersionActivateView(IQACOnlyAPIView):
    def post(self, request, id: int, *args, **kwargs):
        version = get_object_or_404(app_models.ApplicationFormVersion, pk=id)
        with transaction.atomic():
            app_models.ApplicationFormVersion.objects.filter(application_type=version.application_type, is_active=True).exclude(pk=version.pk).update(is_active=False)
            if not version.is_active:
                version.is_active = True
                version.save(update_fields=['is_active'])
        return Response(_version_payload(version))


class ApplicationsAdminFlowListCreateView(IQACOnlyAPIView):
    def get(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        flows = app_models.ApprovalFlow.objects.filter(application_type=app_type).select_related('department').prefetch_related('override_roles', 'steps__role', 'steps__escalate_to_role').order_by('department__name', 'id')
        return Response([_flow_payload(flow) for flow in flows])

    def post(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        department_id = request.data.get('department_id')
        is_active = bool(request.data.get('is_active', True))
        override_role_ids = request.data.get('override_role_ids') or []

        department = None
        if department_id not in (None, '', 0, '0'):
            from academics.models import Department
            department = get_object_or_404(Department, pk=department_id)

        flow = app_models.ApprovalFlow.objects.create(
            application_type=app_type,
            department=department,
            is_active=is_active,
            sla_hours=request.data.get('sla_hours') or None,
        )

        if isinstance(override_role_ids, list):
            flow.override_roles.set(Role.objects.filter(id__in=override_role_ids))
        flow = app_models.ApprovalFlow.objects.prefetch_related('override_roles', 'steps__role', 'steps__escalate_to_role').select_related('department').get(pk=flow.pk)
        return Response(_flow_payload(flow), status=status.HTTP_201_CREATED)


class ApplicationsAdminFlowDetailView(IQACOnlyAPIView):
    def patch(self, request, id: int, *args, **kwargs):
        flow = get_object_or_404(app_models.ApprovalFlow.objects.select_related('department'), pk=id)
        is_active = request.data.get('is_active', flow.is_active)
        next_is_active = bool(is_active)
        override_role_ids = request.data.get('override_role_ids')
        if isinstance(override_role_ids, list):
            flow.override_roles.set(Role.objects.filter(id__in=override_role_ids))

        # Update sla_hours if provided
        if 'sla_hours' in request.data:
            flow.sla_hours = request.data.get('sla_hours') or None
            flow.save(update_fields=['sla_hours'])

        # Enforce final-step rules when turning a flow active.
        if next_is_active and not flow.is_active:
            # refresh steps relationship in a consistent way
            flow = app_models.ApprovalFlow.objects.prefetch_related('steps').get(pk=flow.pk)
            ok, message = _validate_flow_final_step_rules(flow)
            if not ok:
                return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)

        if flow.is_active != next_is_active:
            flow.is_active = next_is_active
            flow.save(update_fields=['is_active'])

        flow = app_models.ApprovalFlow.objects.prefetch_related('override_roles', 'steps__role', 'steps__escalate_to_role').select_related('department').get(pk=flow.pk)
        return Response(_flow_payload(flow))


class ApplicationsAdminStepListCreateView(IQACOnlyAPIView):
    def get(self, request, flow_id: int, *args, **kwargs):
        flow = get_object_or_404(app_models.ApprovalFlow, pk=flow_id)
        steps = flow.steps.select_related('role', 'stage', 'escalate_to_role').order_by('order')
        return Response([_step_payload(step) for step in steps])

    def post(self, request, flow_id: int, *args, **kwargs):
        flow = get_object_or_404(app_models.ApprovalFlow, pk=flow_id)
        role_id = request.data.get('role_id')
        stage_id = request.data.get('stage_id')
        if not role_id and not stage_id:
            return Response({'detail': 'role_id or stage_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if role_id and stage_id:
            return Response({'detail': 'Only one of role_id or stage_id is allowed.'}, status=status.HTTP_400_BAD_REQUEST)

        role = None
        stage = None
        if stage_id:
            stage = get_object_or_404(app_models.ApplicationRoleHierarchyStage, pk=stage_id, application_type=flow.application_type)
        else:
            role = get_object_or_404(Role, pk=role_id)

        is_final = bool(request.data.get('is_final', False))
        escalate_to_role = None
        escalate_to_role_id = request.data.get('escalate_to_role_id')

        ok, payload = _validate_step_rules(flow, step_id=None, is_final=is_final, escalate_to_role_id=escalate_to_role_id)
        if not ok:
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        if escalate_to_role_id:
            escalate_to_role = get_object_or_404(Role, pk=escalate_to_role_id)
        order = request.data.get('order')
        if order in (None, ''):
            order = flow.steps.count() + 1
        step = app_models.ApprovalStep.objects.create(
            approval_flow=flow,
            order=int(order),
            role=role,
            stage=stage,
            sla_hours=request.data.get('sla_hours') or None,
            escalate_to_role=escalate_to_role,
            is_final=is_final,
            can_override=bool(request.data.get('can_override', False)),
            auto_skip_if_unavailable=bool(request.data.get('auto_skip_if_unavailable', False)),
        )
        step = app_models.ApprovalStep.objects.select_related('role', 'stage', 'escalate_to_role').get(pk=step.pk)
        return Response(_step_payload(step), status=status.HTTP_201_CREATED)


class ApplicationsAdminStepDetailView(IQACOnlyAPIView):
    def patch(self, request, id: int, *args, **kwargs):
        step = get_object_or_404(app_models.ApprovalStep.objects.select_related('role', 'stage', 'escalate_to_role'), pk=id)
        role_id = request.data.get('role_id', None)
        stage_id = request.data.get('stage_id', None)
        if role_id and stage_id:
            return Response({'detail': 'Only one of role_id or stage_id is allowed.'}, status=status.HTTP_400_BAD_REQUEST)

        role = None
        stage = None
        if stage_id is not None:
            if stage_id in (None, '', 0, '0'):
                stage = None
            else:
                stage = get_object_or_404(app_models.ApplicationRoleHierarchyStage, pk=stage_id, application_type=step.approval_flow.application_type)

        if role_id is not None:
            if role_id in (None, '', 0, '0'):
                role = None
            else:
                role = get_object_or_404(Role, pk=role_id)

        if role_id is None and stage_id is None:
            # keep existing target
            role = step.role
            stage = step.stage

        if not role and not stage:
            return Response({'detail': 'role_id or stage_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        is_final = bool(request.data.get('is_final', step.is_final))
        escalate_to_role_id = request.data.get('escalate_to_role_id', step.escalate_to_role_id)

        ok, payload = _validate_step_rules(step.approval_flow, step_id=step.id, is_final=is_final, escalate_to_role_id=escalate_to_role_id)
        if not ok:
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        escalate_to_role = None
        if escalate_to_role_id and not is_final:
            escalate_to_role = get_object_or_404(Role, pk=escalate_to_role_id)
        step.role = role
        step.stage = stage
        step.order = int(request.data.get('order', step.order))
        step.sla_hours = request.data.get('sla_hours', step.sla_hours) or None
        step.escalate_to_role = escalate_to_role
        step.is_final = is_final
        step.can_override = bool(request.data.get('can_override', step.can_override))
        step.auto_skip_if_unavailable = bool(request.data.get('auto_skip_if_unavailable', step.auto_skip_if_unavailable))
        step.save(update_fields=['role', 'stage', 'order', 'sla_hours', 'escalate_to_role', 'is_final', 'can_override', 'auto_skip_if_unavailable'])
        step = app_models.ApprovalStep.objects.select_related('role', 'stage', 'escalate_to_role').get(pk=step.pk)
        return Response(_step_payload(step))

    def delete(self, request, id: int, *args, **kwargs):
        step = get_object_or_404(app_models.ApprovalStep, pk=id)
        step.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ApplicationsAdminRolePermissionsView(IQACOnlyAPIView):
    def get(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        rows = app_models.RoleApplicationPermission.objects.filter(application_type=app_type).select_related('role').order_by('role__name')
        return Response([_role_permission_payload(row) for row in rows])

    def put(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        items = request.data.get('items')
        if not isinstance(items, list):
            return Response({'detail': 'items must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        role_ids = [item.get('role_id') for item in items if item.get('role_id')]
        roles = {role.id: role for role in Role.objects.filter(id__in=role_ids)}
        with transaction.atomic():
            existing = {
                row.role_id: row
                for row in app_models.RoleApplicationPermission.objects.filter(application_type=app_type, role_id__in=role_ids)
            }
            keep_ids = set()
            for item in items:
                role_id = item.get('role_id')
                if role_id not in roles:
                    continue
                row = existing.get(role_id)
                if row is None:
                    row = app_models.RoleApplicationPermission.objects.create(
                        application_type=app_type,
                        role=roles[role_id],
                        can_edit_all=bool(item.get('can_edit_all', False)),
                        can_override_flow=bool(item.get('can_override_flow', False)),
                    )
                else:
                    row.can_edit_all = bool(item.get('can_edit_all', False))
                    row.can_override_flow = bool(item.get('can_override_flow', False))
                    row.save(update_fields=['can_edit_all', 'can_override_flow'])
                keep_ids.add(row.id)

            app_models.RoleApplicationPermission.objects.filter(application_type=app_type).exclude(id__in=keep_ids).delete()

        rows = app_models.RoleApplicationPermission.objects.filter(application_type=app_type).select_related('role').order_by('role__name')
        return Response([_role_permission_payload(row) for row in rows])


class ApplicationsAdminRoleHierarchyView(IQACOnlyAPIView):
    """Manual per-type role priority ordering used for flow-starter selection."""

    def get(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        rows = (
            app_models.ApplicationRoleHierarchy.objects.filter(application_type=app_type)
            .select_related('role')
            .order_by('rank', 'role__name')
        )
        return Response([_role_hierarchy_payload(row) for row in rows])

    def put(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        items = request.data.get('items')
        if not isinstance(items, list):
            return Response({'detail': 'items must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        role_ids = [item.get('role_id') for item in items if item.get('role_id')]
        roles = {role.id: role for role in Role.objects.filter(id__in=role_ids)}

        parsed: list[tuple[int, int]] = []
        for item in items:
            role_id = item.get('role_id')
            if not role_id or role_id not in roles:
                continue

            rank = item.get('rank', None)
            if rank in (None, ''):
                continue
            try:
                rank_int = int(rank)
            except Exception:
                return Response({'detail': f'Invalid rank for role_id={role_id}.'}, status=status.HTTP_400_BAD_REQUEST)
            if rank_int < 0:
                return Response({'detail': f'Rank must be >= 0 for role_id={role_id}.'}, status=status.HTTP_400_BAD_REQUEST)
            parsed.append((int(role_id), rank_int))

        with transaction.atomic():
            existing = {
                row.role_id: row
                for row in app_models.ApplicationRoleHierarchy.objects.filter(application_type=app_type, role_id__in=role_ids)
            }

            keep_ids = set()
            for role_id, rank_int in parsed:
                row = existing.get(role_id)
                if row is None:
                    row = app_models.ApplicationRoleHierarchy.objects.create(
                        application_type=app_type,
                        role=roles[role_id],
                        rank=rank_int,
                    )
                else:
                    row.rank = rank_int
                    row.save(update_fields=['rank'])
                keep_ids.add(row.id)

            # Remove any existing mappings not included in this save.
            app_models.ApplicationRoleHierarchy.objects.filter(application_type=app_type).exclude(id__in=keep_ids).delete()

        rows = (
            app_models.ApplicationRoleHierarchy.objects.filter(application_type=app_type)
            .select_related('role')
            .order_by('rank', 'role__name')
        )
        return Response([_role_hierarchy_payload(row) for row in rows])


class ApplicationsAdminRoleHierarchyStagesView(IQACOnlyAPIView):
    """Stage-based manual hierarchy.

    Selection rules (used by backend flow selection):
    1) If the applicant user is explicitly assigned to a stage, that stage wins.
    2) Otherwise, the first stage whose configured roles intersect user's effective roles wins.
    3) If no stages configured, system falls back to non-staged hierarchy methods.

    API contract:
    - GET returns a list of stages (ordered), each with stage_roles and stage_users.
    - PUT replaces the full stage configuration for the application type.
      Users are provided by username.
    """

    def get(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        stages = (
            app_models.ApplicationRoleHierarchyStage.objects.filter(application_type=app_type)
            .prefetch_related('stage_roles__role', 'stage_users__user')
            .order_by('order', 'id')
        )

        payload = []
        for stage in stages:
            payload.append({
                'id': stage.id,
                'name': stage.name,
                'order': stage.order,
                'roles': [
                    {
                        'id': sr.id,
                        'role_id': sr.role_id,
                        'role_name': getattr(sr.role, 'name', None),
                        'rank': sr.rank,
                    }
                    for sr in stage.stage_roles.all().order_by('rank', 'role__name')
                ],
                'users': [
                    {
                        'id': su.id,
                        'user_id': su.user_id,
                        'username': getattr(su.user, 'username', None),
                        'name': str(su.user) if su.user is not None else None,
                    }
                    for su in stage.stage_users.all().select_related('user').order_by('user__username')
                ],
            })

        return Response(payload)

    def put(self, request, type_id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=type_id)
        items = request.data.get('items')
        if not isinstance(items, list):
            return Response({'detail': 'items must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate pinned users: a user should belong to only one stage.
        # Prefer user_id uniqueness; fall back to username (case-insensitive).
        seen_user_ids: dict[int, str] = {}
        seen_usernames: dict[str, str] = {}
        for idx, item in enumerate(items):
            stage_name = str(item.get('name') or '').strip() or f'Stage {idx + 1}'
            users_items = item.get('users') or []
            if not isinstance(users_items, list):
                return Response({'detail': f'users must be a list for stage {stage_name}.'}, status=status.HTTP_400_BAD_REQUEST)
            for u in users_items:
                try:
                    user_id = (u or {}).get('user_id', None)
                    user_id_int = int(user_id) if user_id not in (None, '', 0, '0') else None
                except Exception:
                    user_id_int = None

                if user_id_int is not None:
                    if user_id_int in seen_user_ids and seen_user_ids[user_id_int] != stage_name:
                        return Response(
                            {'detail': f'User_id={user_id_int} is pinned in multiple stages: {seen_user_ids[user_id_int]} and {stage_name}. Remove it from one stage.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    seen_user_ids[user_id_int] = stage_name
                    continue

                uname = str((u or {}).get('username') or '').strip()
                if not uname:
                    continue
                key = uname.lower()
                if key in seen_usernames and seen_usernames[key] != stage_name:
                    return Response(
                        {'detail': f'Username {uname} is pinned in multiple stages: {seen_usernames[key]} and {stage_name}. Remove it from one stage.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                seen_usernames[key] = stage_name

        # Resolve user model
        try:
            from django.contrib.auth import get_user_model

            User = get_user_model()
        except Exception:
            User = None

        with transaction.atomic():
            keep_stage_ids = set()

            # Create/update stages
            for idx, item in enumerate(items):
                stage_id = item.get('id')
                name = str(item.get('name') or '').strip() or f'Stage {idx + 1}'
                order = item.get('order', idx + 1)
                try:
                    order = int(order)
                except Exception:
                    return Response({'detail': f'Invalid order for stage {name}.'}, status=status.HTTP_400_BAD_REQUEST)

                if stage_id:
                    stage = app_models.ApplicationRoleHierarchyStage.objects.filter(application_type=app_type, pk=stage_id).first()
                else:
                    stage = None

                if stage is None:
                    stage = app_models.ApplicationRoleHierarchyStage.objects.create(
                        application_type=app_type,
                        name=name,
                        order=order,
                    )
                else:
                    stage.name = name
                    stage.order = order
                    stage.save(update_fields=['name', 'order'])

                keep_stage_ids.add(stage.id)

                # Stage roles
                roles_items = item.get('roles')
                if roles_items is None:
                    roles_items = []
                if not isinstance(roles_items, list):
                    return Response({'detail': f'roles must be a list for stage {name}.'}, status=status.HTTP_400_BAD_REQUEST)

                role_ids = [r.get('role_id') for r in roles_items if r.get('role_id')]
                role_map = {role.id: role for role in Role.objects.filter(id__in=role_ids)}
                existing_stage_roles = {
                    sr.role_id: sr
                    for sr in app_models.ApplicationRoleHierarchyStageRole.objects.filter(stage=stage, role_id__in=role_ids).select_related('role')
                }
                keep_stage_role_ids = set()
                for r in roles_items:
                    role_id = r.get('role_id')
                    if not role_id or role_id not in role_map:
                        continue
                    try:
                        rank = int(r.get('rank', 0))
                    except Exception:
                        return Response({'detail': f'Invalid rank for role_id={role_id} in stage {name}.'}, status=status.HTTP_400_BAD_REQUEST)
                    if rank < 0:
                        return Response({'detail': f'Rank must be >= 0 for role_id={role_id} in stage {name}.'}, status=status.HTTP_400_BAD_REQUEST)

                    sr = existing_stage_roles.get(int(role_id))
                    if sr is None:
                        sr = app_models.ApplicationRoleHierarchyStageRole.objects.create(
                            stage=stage,
                            role=role_map[int(role_id)],
                            rank=rank,
                        )
                    else:
                        sr.rank = rank
                        sr.save(update_fields=['rank'])
                    keep_stage_role_ids.add(sr.id)

                app_models.ApplicationRoleHierarchyStageRole.objects.filter(stage=stage).exclude(id__in=keep_stage_role_ids).delete()

                # Stage users (by username)
                users_items = item.get('users')
                if users_items is None:
                    users_items = []
                if not isinstance(users_items, list):
                    return Response({'detail': f'users must be a list for stage {name}.'}, status=status.HTTP_400_BAD_REQUEST)
                if User is None and users_items:
                    return Response({'detail': 'User model not available.'}, status=status.HTTP_400_BAD_REQUEST)

                user_ids: list[int] = []
                usernames: list[str] = []
                for u in users_items:
                    try:
                        user_id = u.get('user_id', None)
                        user_id_int = int(user_id) if user_id not in (None, '', 0, '0') else None
                    except Exception:
                        user_id_int = None
                    if user_id_int is not None:
                        user_ids.append(user_id_int)
                        continue
                    username = str(u.get('username') or '').strip()
                    if username:
                        usernames.append(username)

                users_by_id = {}
                if user_ids and User is not None:
                    found = list(User.objects.filter(id__in=user_ids))
                    users_by_id = {usr.id: usr for usr in found}
                    missing_ids = [uid for uid in user_ids if uid not in users_by_id]
                    if missing_ids:
                        return Response({'detail': f'Unknown user_id(s) in stage {name}: {", ".join([str(x) for x in missing_ids])}'}, status=status.HTTP_400_BAD_REQUEST)

                users_by_username = {}
                if usernames and User is not None:
                    found = list(User.objects.filter(username__in=usernames))
                    users_by_username = {usr.username: usr for usr in found}
                    missing = [uname for uname in usernames if uname not in users_by_username]
                    if missing:
                        return Response({'detail': f'Unknown username(s) in stage {name}: {", ".join(missing)}'}, status=status.HTTP_400_BAD_REQUEST)

                existing_stage_users = {
                    su.user_id: su
                    for su in app_models.ApplicationRoleHierarchyStageUser.objects.filter(stage=stage)
                }
                keep_stage_user_ids = set()
                final_users = {}
                final_users.update(users_by_id)
                for uname, usr in users_by_username.items():
                    final_users[usr.id] = usr

                for user_id_int, usr in final_users.items():
                    su = existing_stage_users.get(user_id_int)
                    if su is None:
                        su = app_models.ApplicationRoleHierarchyStageUser.objects.create(stage=stage, user=usr)
                    keep_stage_user_ids.add(su.id)
                app_models.ApplicationRoleHierarchyStageUser.objects.filter(stage=stage).exclude(id__in=keep_stage_user_ids).delete()

            # Remove stages not present
            try:
                app_models.ApplicationRoleHierarchyStage.objects.filter(application_type=app_type).exclude(id__in=keep_stage_ids).delete()
            except ProtectedError as e:
                return Response(
                    {'detail': 'Cannot delete one or more stages because they are currently used in an Approval Flow step. Please remove them from the approval flow first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Return updated config
        return self.get(request, type_id)


class ApplicationsAdminUserSearchView(IQACOnlyAPIView):
    """Search users for admin pickers.

    Matches on:
    - username
    - email
    - first/last name
    - mobile
    - student reg_no
    - staff staff_id
    """

    def get(self, request, *args, **kwargs):
        q = str(request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response([])

        from django.contrib.auth import get_user_model

        User = get_user_model()

        query = (
            Q(username__icontains=q)
            | Q(email__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(mobile_no__icontains=q)
            | Q(student_profile__reg_no__icontains=q)
            | Q(staff_profile__staff_id__icontains=q)
        )

        qs = (
            User.objects.filter(query)
            .select_related('student_profile', 'staff_profile')
            .order_by('username', 'email')
        )

        rows = []
        for usr in qs[:20]:
            student = getattr(usr, 'student_profile', None)
            staff = getattr(usr, 'staff_profile', None)
            reg_no = getattr(student, 'reg_no', None) if student is not None else None
            staff_id = getattr(staff, 'staff_id', None) if staff is not None else None
            profile_type = 'STUDENT' if reg_no else ('STAFF' if staff_id else None)
            rows.append({
                'user_id': usr.id,
                'username': getattr(usr, 'username', None),
                'email': getattr(usr, 'email', None),
                'name': str(usr) if usr is not None else None,
                'mobile_no': getattr(usr, 'mobile_no', None),
                'reg_no': reg_no,
                'staff_id': staff_id,
                'profile_type': profile_type,
            })

        return Response(rows)


class ApplicationsAdminSubmissionListView(IQACOnlyAPIView):
    def get(self, request, *args, **kwargs):
        qs = app_models.Application.objects.select_related('application_type', 'applicant_user', 'current_step__role', 'current_step__stage').order_by('-created_at')
        type_id = request.query_params.get('application_type_id')
        if type_id:
            qs = qs.filter(application_type_id=type_id)
        state = request.query_params.get('state')
        if state:
            qs = qs.filter(current_state=state)

        rows = []
        for app in qs[:100]:
            rows.append({
                'id': app.id,
                'application_type_id': app.application_type_id,
                'application_type_name': app.application_type.name if app.application_type else None,
                'applicant_username': getattr(app.applicant_user, 'username', None),
                'current_state': app.current_state,
                'status': app.status,
                'current_step_role': (
                    getattr(getattr(app.current_step, 'stage', None), 'name', None)
                    if getattr(app.current_step, 'stage_id', None)
                    else getattr(getattr(app.current_step, 'role', None), 'name', None)
                ),
                'attachments_count': app.attachments.filter(is_deleted=False).count(),
                'history_count': app.actions.count(),
                'submitted_at': app.submitted_at,
                'created_at': app.created_at,
            })
        return Response(rows)