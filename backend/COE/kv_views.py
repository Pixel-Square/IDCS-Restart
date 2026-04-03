"""
Generic key-value store API for COE page data.
Replaces all localStorage usage so data persists across devices / browsers.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CoeKeyValueStore


class CoeKeyValueStoreView(APIView):
    """
    GET  ?key=<store_name>  → { key, data }
    POST { key, data }      → { saved: true }
    DELETE ?key=<store_name> → { deleted: true }
    """

    def get(self, request):
        key = (request.query_params.get('key') or '').strip()
        if not key:
            return Response(
                {'detail': 'key query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            obj = CoeKeyValueStore.objects.get(store_name=key)
            return Response({'key': key, 'data': obj.data})
        except CoeKeyValueStore.DoesNotExist:
            return Response({'key': key, 'data': None})

    def post(self, request):
        if not getattr(request.user, 'is_authenticated', False):
            return Response(
                {'detail': 'Authentication required.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        key = str(request.data.get('key') or '').strip()
        if not key:
            return Response(
                {'detail': 'key is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = request.data.get('data')
        CoeKeyValueStore.objects.update_or_create(
            store_name=key,
            defaults={'data': data},
        )
        return Response({'saved': True}, status=status.HTTP_200_OK)

    def delete(self, request):
        if not getattr(request.user, 'is_authenticated', False):
            return Response(
                {'detail': 'Authentication required.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        key = (request.query_params.get('key') or '').strip()
        if not key:
            return Response(
                {'detail': 'key is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        CoeKeyValueStore.objects.filter(store_name=key).delete()
        return Response({'deleted': True}, status=status.HTTP_200_OK)
