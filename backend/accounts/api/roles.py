from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Role


class RolesListView(APIView):
    """Return a list of all defined role names (uppercase).

    Authentication: JWT (via DRF settings)
    Authorization: user must be authenticated
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        qs = Role.objects.all().order_by('name').values_list('name', flat=True)
        names = [str(n).upper() for n in qs if n]
        return Response({'roles': names})


__all__ = ['RolesListView']
