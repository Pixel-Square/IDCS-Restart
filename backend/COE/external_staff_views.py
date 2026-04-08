import random
import string
import json
import urllib.error
import urllib.request
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers
from django.db import transaction
from academics.models import ExtStaffProfile
from django.contrib.auth import get_user_model

User = get_user_model()


class ExternalStaffSerializer(serializers.ModelSerializer):
    """Serialize ExtStaffProfile into the shape the COE frontend expects."""
    staff_id = serializers.CharField(source='external_id', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    department_name = serializers.CharField(source='department', read_only=True)
    login_code = serializers.SerializerMethodField()

    class Meta:
        model = ExtStaffProfile
        fields = ['id', 'staff_id', 'first_name', 'last_name', 'email', 'department_name', 'login_code']

    def get_login_code(self, obj):
        return getattr(obj, 'login_code', None) or None


def _serialize_local_external_staff(strict: bool):
    staff = ExtStaffProfile.objects.filter(is_active=True).select_related('user')
    if strict:
        staff = staff.exclude(user__email__iendswith='@example.com').exclude(user__email__exact='')
    staff = staff.order_by('external_id')
    serializer = ExternalStaffSerializer(staff, many=True)
    return serializer.data


class ExternalStaffListView(APIView):
    def get(self, request):
        strict = str(request.query_params.get('strict', '1')).lower() in ('1', 'true', 'yes')
        return Response(_serialize_local_external_staff(strict))


class ExternalStaffDbMirrorView(APIView):
    """Fetch external staff from db.krgi.co.in first, then fallback to local DB."""

    def get(self, request):
        strict = str(request.query_params.get('strict', '0')).lower() in ('1', 'true', 'yes')
        target = f"https://db.krgi.co.in/api/coe/external-staff/?strict={'1' if strict else '0'}"
        headers = {
            'Accept': 'application/json',
        }
        auth = request.META.get('HTTP_AUTHORIZATION')
        if auth:
            headers['Authorization'] = auth

        req = urllib.request.Request(target, headers=headers, method='GET')

        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                charset = response.headers.get_content_charset() or 'utf-8'
                payload = response.read().decode(charset, errors='replace')
                data = json.loads(payload)
                if isinstance(data, list):
                    return Response(data)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
            pass

        return Response(_serialize_local_external_staff(strict))


class AssignExternalCodesView(APIView):
    def post(self, request):
        # ExtStaffProfile doesn't have a login_code field yet.
        # For now, return a count of external staff as a placeholder.
        staff_list = ExtStaffProfile.objects.filter(is_active=True)
        count = staff_list.count()
        return Response({
            'message': f'{count} external staff members found. Login code feature is pending model update.',
            'assigned_count': 0,
        })
