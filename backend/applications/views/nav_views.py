from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Q

from academics.models import DepartmentRole, SectionAdvisor, StudentMentorMap
from applications import models as app_models
from accounts.models import Role


class ApplicationsNavView(APIView):
    """Small helper endpoint for frontend navigation.

    It answers: should we show an "Applications" entry in the sidebar for this user,
    based on whether their staff profile participates in any application approval roles
    (mentor/advisor/department roles) or has override rights via configured roles.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        user = request.user
        staff = getattr(user, 'staff_profile', None)

        dept = None
        if staff is not None:
            try:
                dept = staff.current_department
            except Exception:
                dept = getattr(staff, 'department', None)

        def _active_flow_step_exists(role_code: str, department_id=None) -> bool:
            qs = app_models.ApprovalStep.objects.filter(
                approval_flow__is_active=True,
            ).filter(
                Q(role__name__iexact=str(role_code or ''))
                | Q(stage__stage_roles__role__name__iexact=str(role_code or ''))
            )
            if department_id is None:
                return qs.filter(approval_flow__department__isnull=True).exists()
            return qs.filter(
                Q(approval_flow__department_id=department_id) | Q(approval_flow__department__isnull=True)
            ).exists()

        def _active_stage_step_exists_for_pinned_user() -> bool:
            """Return True if any active step targets a stage this user is pinned to."""
            try:
                return app_models.ApprovalStep.objects.filter(
                    approval_flow__is_active=True,
                    stage__stage_users__user=user,
                ).exists()
            except Exception:
                return False

        roles = []

        seen = set()

        def _add_role(code: str, department_id=None, department_name=None):
            code_norm = str(code or '').strip().upper()
            if not code_norm:
                return
            key = (code_norm, department_id)
            if key in seen:
                return
            seen.add(key)
            roles.append({'code': code_norm, 'department_id': department_id, 'department_name': department_name})

        if staff is not None:
            # Mentor role: show only if user is a mentor AND a flow step exists
            if StudentMentorMap.objects.filter(mentor=staff, is_active=True).exists():
                dept_id = getattr(dept, 'id', None)
                if _active_flow_step_exists('MENTOR', department_id=dept_id):
                    _add_role('MENTOR', department_id=dept_id, department_name=getattr(dept, 'name', None))

            # Advisor role: show only if user is a section advisor AND a flow step exists
            if SectionAdvisor.objects.filter(advisor=staff, is_active=True).exists():
                dept_id = getattr(dept, 'id', None)
                if _active_flow_step_exists('ADVISOR', department_id=dept_id):
                    _add_role('ADVISOR', department_id=dept_id, department_name=getattr(dept, 'name', None))

            # DepartmentRole entries like HOD/AHOD for specific departments
            for row in DepartmentRole.objects.filter(staff=staff, is_active=True).select_related('department').order_by('department__name', 'role'):
                code = str(row.role or '').upper()
                if not code:
                    continue
                dept_id = getattr(row, 'department_id', None)
                if _active_flow_step_exists(code, department_id=dept_id):
                    _add_role(code, department_id=dept_id, department_name=getattr(row.department, 'name', None))

        # Override roles based on the user's static Role memberships
        roles_rel = getattr(user, 'roles', None)
        user_roles = list(roles_rel.all()) if roles_rel is not None and hasattr(roles_rel, 'all') else []

        # Include roles from any Role Hierarchy stage pins (across application types).
        # This supports using stages as a way to group override eligibility.
        try:
            stage_ids = (
                app_models.ApplicationRoleHierarchyStageUser.objects
                .filter(user=user)
                .values_list('stage_id', flat=True)
                .distinct()
            )
            if stage_ids:
                stage_role_ids = (
                    app_models.ApplicationRoleHierarchyStageRole.objects
                    .filter(stage_id__in=stage_ids)
                    .values_list('role_id', flat=True)
                    .distinct()
                )
                stage_roles = list(Role.objects.filter(id__in=stage_role_ids))
                by_id = {r.id: r for r in (user_roles + stage_roles) if getattr(r, 'id', None) is not None}
                user_roles = list(by_id.values())
        except Exception:
            pass

        # Also include any of the user's logical roles that are directly used as
        # approval-step roles in active flows. This covers setups where approvals
        # are assigned via static role membership rather than academic mappings.
        staff_dept_id = getattr(dept, 'id', None)
        staff_dept_name = getattr(dept, 'name', None)
        for r in user_roles:
            name = getattr(r, 'name', None)
            if not name:
                continue
            if _active_flow_step_exists(name, department_id=staff_dept_id):
                _add_role(name, department_id=staff_dept_id, department_name=staff_dept_name)

        override_roles = []
        if user_roles:
            override_role_ids = set(
                app_models.ApprovalFlow.objects.filter(is_active=True, override_roles__in=user_roles)
                .values_list('override_roles__id', flat=True)
                .distinct()
            )
            override_roles = [r.name for r in user_roles if r.id in override_role_ids]

        # Students (users with no staff profile) should never see the Approvals Inbox
        # even if they somehow appear in override_roles.
        if staff is None:
            override_roles = []

        # Pinned stage users should still see Approvals Inbox even if they don't
        # have a static Role that matches a step.
        show_applications = bool(roles or override_roles or _active_stage_step_exists_for_pinned_user())

        return Response({
            'show_applications': show_applications,
            'staff_roles': roles,
            'staff_department': {
                'id': getattr(dept, 'id', None),
                'name': getattr(dept, 'name', None),
            } if dept is not None else None,
            'override_roles': override_roles,
        })
