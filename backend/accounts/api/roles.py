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
        college_id = getattr(request, 'college_id', None)

        if college_id:
            # College-scoped: only roles activated for this college
            from college.models import CollegeRole
            active_role_ids = list(
                CollegeRole.objects.filter(college_id=college_id, is_active=True)
                .values_list('role_id', flat=True)
            )
            qs = Role.objects.filter(id__in=active_role_ids).exclude(
                name__iexact='SUPER_ADMIN'
            ).values_list('name', flat=True)
        else:
            qs = Role.objects.exclude(name__iexact='SUPER_ADMIN').values_list('name', flat=True)

        # Role names may exist in mixed case (e.g. "HOD" and "hod") as separate
        # DB rows; dedupe after uppercasing so the frontend doesn't show
        # duplicate entries.
        names = sorted({str(n).upper() for n in qs if n})
        return Response({'roles': names})


__all__ = ['RolesListView']
