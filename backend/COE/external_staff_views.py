import json
import random
import string
import urllib.error
import urllib.request

from django.db import transaction
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import ExtStaffProfile, StaffProfile


class StaffExternalStaffSerializer(serializers.ModelSerializer):
    """Serialize StaffProfile external staff into the shape the COE frontend expects."""

    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True, default='')

    class Meta:
        model = StaffProfile
        fields = ['id', 'staff_id', 'first_name', 'last_name', 'email', 'department_name', 'login_code']


class AcademicExternalStaffSerializer(serializers.ModelSerializer):
    """Serialize academics.ExtStaffProfile into the same shape used by COE."""

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
        return None


def _apply_strict_filter(qs, strict: bool):
    if not strict:
        return qs
    return qs.exclude(user__email__iendswith='@example.com').exclude(user__email__exact='')


def _admin_source_queryset():
    exact_qs = StaffProfile.objects.filter(status='EXTERNAL').select_related('user', 'department')
    if exact_qs.exists():
        return exact_qs

    ci_qs = StaffProfile.objects.filter(status__iexact='EXTERNAL').select_related('user', 'department')
    if ci_qs.exists():
        return ci_qs

    return StaffProfile.objects.filter(status__icontains='EXTERNAL').select_related('user', 'department')


def _serialize_staffprofile_external_staff(staff_qs, strict: bool):
    staff_qs = _apply_strict_filter(staff_qs, strict).order_by('staff_id')
    return StaffExternalStaffSerializer(staff_qs, many=True).data


def _serialize_extstaffprofile(staff_qs, strict: bool):
    staff_qs = _apply_strict_filter(staff_qs, strict).order_by('external_id')
    return AcademicExternalStaffSerializer(staff_qs, many=True).data


def _serialize_local_external_staff(strict: bool):
    staff = StaffProfile.objects.filter(status__iexact='EXTERNAL').select_related('user', 'department')
    return _serialize_staffprofile_external_staff(staff, strict)


def _serialize_admin_source_staff(strict: bool):
    return _serialize_staffprofile_external_staff(_admin_source_queryset(), strict)


class ExternalStaffListView(APIView):
    def get(self, request):
        strict = str(request.query_params.get('strict', '1')).lower() in ('1', 'true', 'yes')
        return Response(_serialize_local_external_staff(strict))


class ExternalStaffAdminSourceView(APIView):
    """Expose the same source used by the admin External Staff proxy list."""

    def get(self, request):
        strict = str(request.query_params.get('strict', '0')).lower() in ('1', 'true', 'yes')
        return Response(_serialize_admin_source_staff(strict))


class ExternalStaffAcademicsProfilesView(APIView):
    """Expose academics ExtStaffProfile rows in the same shape as external staff API."""

    def get(self, request):
        strict = str(request.query_params.get('strict', '0')).lower() in ('1', 'true', 'yes')
        qs = ExtStaffProfile.objects.filter(is_active=True).select_related('user')
        return Response(_serialize_extstaffprofile(qs, strict))


class ExternalStaffDbMirrorView(APIView):
    """Fetch external staff from db.krgi.co.in first, then fallback to local DB."""

    def get(self, request):
        strict = str(request.query_params.get('strict', '0')).lower() in ('1', 'true', 'yes')
        target = f"https://db.krgi.co.in/api/coe/external-staff/?strict={'1' if strict else '0'}"
        headers = {'Accept': 'application/json'}

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
        strict = str(request.query_params.get('strict', '1')).lower() in ('1', 'true', 'yes')
        staff_qs = _apply_strict_filter(_admin_source_queryset(), strict)
        updated_count = 0

        with transaction.atomic():
            for staff in staff_qs:
                code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
                staff.login_code = code
                staff.save(update_fields=['login_code'])
                updated_count += 1

        return Response({
            'message': f'Assigned login codes for {updated_count} external staff members.',
            'assigned_count': updated_count,
        })
