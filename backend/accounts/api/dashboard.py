from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from accounts.services_dashboard import resolve_dashboard_capabilities


class DashboardView(APIView):
    """Return grouped capability data for the authenticated user.

    Authentication: JWT (via DRF settings)
    Authorization: user must be authenticated and active
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        if not getattr(user, 'is_active', False):
            return Response({'detail': 'User account is inactive.'}, status=status.HTTP_403_FORBIDDEN)

        data = resolve_dashboard_capabilities(user)
        return Response(data)


__all__ = ['DashboardView']
