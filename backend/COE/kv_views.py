"""
Generic key-value store API for COE page data.
Replaces all localStorage usage so data persists across devices / browsers.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CoeKeyValueStore


def _sanitize_nptel_ece_sem8_course_bundle_map(data):
    if not isinstance(data, dict):
        return data

    fk = 'ECE::SEM8'
    d1 = 'E2560500186'  # PRIYADHARSHINI.A
    d2 = 'E2560500222'  # SHAM LICE W (original)
    d_bad = 'E2560500241'  # duplicate/bad
    b1 = '20GE7811EC001'
    b2 = '20GE7812EC001'

    cm = data.get(fk)
    if not isinstance(cm, dict):
        return data

    keys_7811 = [k for k in cm.keys() if str(k).split('::')[2:3] == ['20GE7811']]
    keys_7812 = [k for k in cm.keys() if str(k).split('::')[2:3] == ['20GE7812']]

    for k in keys_7811:
        v = cm.get(k) or {}
        cds = [x for x in (v.get('courseDummies') or []) if x != d1]
        bundles = v.get('bundles') if isinstance(v.get('bundles'), dict) else {}
        bundles[b1] = [x for x in cds if x != d_bad]
        v['courseDummies'] = cds
        v['bundles'] = bundles
        cm[k] = v

    for k in keys_7812:
        v = cm.get(k) or {}
        cds = [x for x in (v.get('courseDummies') or []) if x != d_bad]
        if d1 not in cds:
            cds.append(d1)
        if d2 not in cds:
            cds.append(d2)
        bundles = v.get('bundles') if isinstance(v.get('bundles'), dict) else {}
        bundles[b2] = list(cds)
        v['courseDummies'] = cds
        v['bundles'] = bundles
        cm[k] = v

    data[fk] = cm
    return data


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
        if key == 'coe-course-bundle-dummies-v1':
            data = _sanitize_nptel_ece_sem8_course_bundle_map(data)
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
