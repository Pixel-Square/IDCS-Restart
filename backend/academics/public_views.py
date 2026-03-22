from __future__ import annotations

from typing import Optional

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StaffProfile, StudentProfile


def _full_name(user) -> str:
    try:
        name = (user.get_full_name() or '').strip()
    except Exception:
        name = ''
    if name:
        return name
    return (getattr(user, 'username', None) or '').strip() or 'Unknown'


def _initials(name: str) -> str:
    parts = [p for p in (name or '').strip().split() if p]
    if not parts:
        return '??'
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][:1] + parts[-1][:1]).upper()


def _dept_label(dept) -> Optional[str]:
    if not dept:
        return None
    # Prefer long-form department name for UI.
    for attr in ('name', 'short_name', 'code'):
        val = getattr(dept, attr, None)
        if val:
            return str(val).strip()
    return str(dept).strip() or None


def _absolute_media_url(request, file_field) -> Optional[str]:
    try:
        if not file_field:
            return None
        url = getattr(file_field, 'url', None)
        if not url:
            return None
        return request.build_absolute_uri(url)
    except Exception:
        return None


class PublicProfileLookupView(APIView):
    """Public, minimal profile lookup for krgiweb Credits page.

    Query param: `id` can be either a StaffProfile.staff_id or StudentProfile.reg_no.
    Returns non-sensitive identity information only.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        raw = (request.query_params.get('id') or '').strip()
        if not raw:
            return Response({'detail': 'Missing id'}, status=400)

        # Prefer staff_id match first
        staff = (
            StaffProfile.objects.select_related('user', 'department')
            .filter(staff_id__iexact=raw)
            .first()
        )
        if staff is not None:
            user = staff.user
            dept = None
            try:
                dept = staff.get_current_department()
            except Exception:
                dept = getattr(staff, 'department', None)

            name = _full_name(user)
            return Response(
                {
                    'kind': 'staff',
                    'staff_id': staff.staff_id,
                    'name': name,
                    'initials': _initials(name),
                    'department': _dept_label(dept),
                    'profile_image': _absolute_media_url(request, getattr(staff, 'profile_image', None)),
                },
                status=200,
            )

        student = (
            StudentProfile.objects.select_related('user', 'home_department', 'section')
            .filter(reg_no__iexact=raw)
            .first()
        )
        if student is not None:
            user = student.user
            dept = getattr(student, 'home_department', None)
            if dept is None:
                # best-effort fallback via section -> batch -> course -> department
                try:
                    dept = student.section.batch.course.department  # type: ignore[attr-defined]
                except Exception:
                    dept = None

            name = _full_name(user)
            return Response(
                {
                    'kind': 'student',
                    'reg_no': student.reg_no,
                    'name': name,
                    'initials': _initials(name),
                    'department': _dept_label(dept),
                    'profile_image': _absolute_media_url(request, getattr(student, 'profile_image', None)),
                },
                status=200,
            )

        return Response({'detail': 'Not found'}, status=404)
