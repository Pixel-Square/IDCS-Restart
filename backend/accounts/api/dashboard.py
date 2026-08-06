from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import logging

from accounts.services_dashboard import resolve_dashboard_capabilities

log = logging.getLogger(__name__)


class DashboardView(APIView):
    """Return grouped capability data for the authenticated user.

    Authentication: JWT (via DRF settings)
    Authorization: user must be authenticated and active
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            user = request.user
            if not getattr(user, 'is_active', False):
                return Response({'detail': 'User account is inactive.'}, status=status.HTTP_403_FORBIDDEN)

            data = resolve_dashboard_capabilities(user)
            return Response(data)
        except Exception as e:
            log.exception('Error in DashboardView for user %s (id=%s): %s',
                         getattr(request.user, 'username', 'unknown'),
                         getattr(request.user, 'id', 'unknown'),
                         str(e))
            # Return a minimal but valid dashboard response
            return Response(
                {
                    'username': getattr(request.user, 'username', ''),
                    'email': getattr(request.user, 'email', ''),
                    'is_iqac_main': False,
                    'profile_type': None,
                    'roles': [],
                    'permissions': [],
                    'profile_status': None,
                    'capabilities': {},
                    'flags': {
                        'is_student': False,
                        'is_staff': False,
                        'can_view_curriculum_master': False,
                        'can_edit_curriculum_master': False,
                        'can_approve_department_curriculum': False,
                        'can_fill_department_curriculum': False,
                    },
                    'entry_points': {
                        'curriculum_master': False,
                        'department_curriculum': False,
                        'student_curriculum_view': False,
                        'hod_obe_requests': False,
                        'obe_master_requests': False,
                        'academic_calendar_admin': False,
                    },
                    'college_features': [],
                    'role_features': [],
                    'error': 'Error retrieving dashboard capabilities',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )



__all__ = ['DashboardView']
