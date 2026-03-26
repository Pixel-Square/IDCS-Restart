from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.conf import settings

from applications.services import inbox_service
from applications.serializers.inbox_serializers import ApproverInboxItemSerializer
from applications import models as app_models


class ApproverInboxView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        user = request.user
        items = inbox_service.get_pending_approvals_for_user(user)
        serializer = ApproverInboxItemSerializer(items, many=True, context={'request': request})
        return Response(serializer.data)


def _display_name(user) -> str:
    if not user:
        return ''
    name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return name or user.username


class PastApprovalsView(APIView):
    """GET /api/applications/past-approvals/

    Returns the 50 most recent terminal-state (APPROVED/REJECTED) applications
    that the current user has acted on, ordered by final decision date.
    Includes gatepass exit details so approvers can see actual exit status.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        actions = (
            app_models.ApprovalAction.objects
            .filter(
                acted_by=request.user,
                action__in=[app_models.ApprovalAction.Action.APPROVED, app_models.ApprovalAction.Action.REJECTED],
            )
            .exclude(application__applicant_user=request.user)
            .select_related(
                'application',
                'application__application_type',
                'application__applicant_user',
                'application__student_profile__section__batch__course__department',
                'application__staff_profile__department',
                'application__gatepass_scanned_by',
            )
            .order_by('-acted_at')[:50]
        )

        def applicant_profile_image_url(app):
            try:
                if app.student_profile and getattr(app.student_profile, 'profile_image', None):
                    return request.build_absolute_uri(app.student_profile.profile_image.url)
                if app.staff_profile and getattr(app.staff_profile, 'profile_image', None):
                    return request.build_absolute_uri(app.staff_profile.profile_image.url)
                path = (getattr(app.applicant_user, 'profile_image', '') or '').strip() if app.applicant_user else ''
                if not path:
                    return None
                if path.startswith('http://') or path.startswith('https://'):
                    return path
                media_url = settings.MEDIA_URL or '/media/'
                rel = f"{media_url.rstrip('/')}/{path.lstrip('/')}"
                return request.build_absolute_uri(rel)
            except Exception:
                return None

        data = []
        for act in actions:
            app = act.application
            kind = None
            if getattr(app, 'student_profile', None):
                kind = 'STUDENT'
            elif getattr(app, 'staff_profile', None):
                kind = 'STAFF'

            roll = None
            if app.student_profile:
                roll = app.student_profile.reg_no
            elif getattr(app, 'staff_profile', None):
                roll = getattr(app.staff_profile, 'staff_id', None)

            dept = None
            sp = app.student_profile
            if sp and getattr(sp, 'section', None):
                try:
                    dept = sp.section.batch.course.department.name
                except Exception:
                    pass

            data.append({
                'application_id': app.id,
                'application_type': app.application_type.name,
                'applicant_name': _display_name(app.applicant_user),
                'applicant_profile_image': applicant_profile_image_url(app),
                'applicant_kind': kind,
                'applicant_roll_or_staff_id': roll,
                'department_name': dept,
                'current_state': app.current_state,
                'decision': act.action,
                'decision_at': act.acted_at.isoformat() if act.acted_at else None,
                'submitted_at': app.submitted_at.isoformat() if app.submitted_at else None,
                'final_decision_at': app.final_decision_at.isoformat() if app.final_decision_at else None,
                'gatepass_scanned_at': app.gatepass_scanned_at.isoformat() if app.gatepass_scanned_at else None,
                'gatepass_scanned_by': _display_name(app.gatepass_scanned_by) if app.gatepass_scanned_by else None,
            })
        return Response(data)
