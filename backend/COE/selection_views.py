"""
API views for persisting COE Course List selections (QP type, ESE type)
so they are shared across devices / browsers.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CoeCourseSelectionStore


class CoeCourseSelectionView(APIView):
    """
    GET  ?key=<department>::<semester>
         → { selections: {...}, is_locked: bool }
    POST { key, selections, is_locked }
         → { saved: true }
    """

    def get(self, request):
        key = (request.query_params.get('key') or '').strip()
        if not key:
            return Response(
                {'detail': 'key query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            obj = CoeCourseSelectionStore.objects.get(store_key=key)
            return Response({
                'selections': obj.selections or {},
                'is_locked': obj.is_locked,
            })
        except CoeCourseSelectionStore.DoesNotExist:
            return Response({
                'selections': {},
                'is_locked': False,
            })

    def post(self, request):
        if not getattr(request.user, 'is_authenticated', False):
            return Response(
                {'detail': 'Authentication required.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        payload = request.data or {}
        key = str(payload.get('key') or '').strip()
        if not key:
            return Response(
                {'detail': 'key is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selections = payload.get('selections')
        if not isinstance(selections, dict):
            return Response(
                {'detail': 'selections must be an object.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_locked = bool(payload.get('is_locked', False))

        CoeCourseSelectionStore.objects.update_or_create(
            store_key=key,
            defaults={
                'selections': selections,
                'is_locked': is_locked,
            },
        )

        return Response({'saved': True}, status=status.HTTP_200_OK)
