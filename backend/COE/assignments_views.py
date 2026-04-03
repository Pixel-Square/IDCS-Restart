from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CoeAssignmentStore


def _parse_course_key(course_key: str) -> tuple[str, str, str, str]:
    parts = str(course_key or '').split('::')
    return (
        parts[0] or '',
        parts[1] or '',
        parts[2] or '',
        parts[3] or '',
    )


def _normalize_faculty_code(value: str) -> str:
    return str(value or '').strip().upper()


def _serialize_allocation(row: CoeAssignmentStore, faculty_code: str) -> list[dict]:
    results: list[dict] = []
    normalized_code = _normalize_faculty_code(faculty_code)
    if not normalized_code:
        return results

    parts = str(row.store_key or '').split('::')
    if len(parts) < 3:
        return results

    department = parts[0] or ''
    semester = parts[1] or ''
    date = parts[2] or ''

    for assignment in row.assignments or []:
        course_key = str(assignment.get('courseKey') or '').strip()
        if not course_key:
            continue

        _, _, course_code, course_name = _parse_course_key(course_key)
        for valuator in assignment.get('valuators') or []:
            v_code = _normalize_faculty_code(valuator.get('facultyCode'))
            if v_code != normalized_code:
                continue

            scripts = int(valuator.get('scripts') or 0)
            bundles = valuator.get('bundles') if isinstance(valuator.get('bundles'), list) else []
            if scripts <= 0 and not bundles:
                continue

            results.append(
                {
                    'storeKey': row.store_key,
                    'department': department,
                    'semester': semester,
                    'date': date,
                    'courseKey': course_key,
                    'courseCode': course_code,
                    'courseName': course_name,
                    'facultyName': str(valuator.get('facultyName') or ''),
                    'scripts': scripts,
                    'bundles': bundles,
                }
            )

    return results


class CoeAssignmentStoreView(APIView):
    """Public read / authenticated write endpoint for COE assignments."""

    def get(self, request):
        faculty_code = _normalize_faculty_code(request.query_params.get('faculty_code', ''))
        if not faculty_code:
            return Response({'detail': 'faculty_code is required.'}, status=status.HTTP_400_BAD_REQUEST)

        allocations: list[dict] = []
        for row in CoeAssignmentStore.objects.all().only('store_key', 'assignments'):
            allocations.extend(_serialize_allocation(row, faculty_code))

        allocations.sort(key=lambda item: str(item.get('date') or ''), reverse=True)
        return Response({'results': allocations})

    def post(self, request):
        if not getattr(request.user, 'is_authenticated', False):
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        payload = request.data or {}
        stores = payload.get('stores')
        if not isinstance(stores, dict) or not stores:
            return Response({'detail': 'stores must be a non-empty object.'}, status=status.HTTP_400_BAD_REQUEST)

        written = 0
        with transaction.atomic():
            for store_key, assignments in stores.items():
                normalized_key = str(store_key or '').strip()
                if not normalized_key:
                    continue
                if not isinstance(assignments, list):
                    continue
                CoeAssignmentStore.objects.update_or_create(
                    store_key=normalized_key,
                    defaults={'assignments': assignments},
                )
                written += 1

        return Response({'saved': written}, status=status.HTTP_200_OK)