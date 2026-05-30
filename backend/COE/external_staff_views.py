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


def _apply_strict_filter(staff_qs, strict: bool):
    if not strict:
        return staff_qs
    # Exclude known placeholder records in strict mode.
    return staff_qs.exclude(user__email__iendswith='@example.com').exclude(user__email__exact='')


def _admin_source_queryset():
    # Match admin proxy queryset first: status='EXTERNAL' (exact).
    exact_qs = StaffProfile.objects.filter(status='EXTERNAL').select_related('user', 'department')
    if exact_qs.exists():
        return exact_qs

    # Fallback to case-insensitive match.
    ci_qs = StaffProfile.objects.filter(status__iexact='EXTERNAL').select_related('user', 'department')
    if ci_qs.exists():
        return ci_qs

    # Last fallback for dirty status values like "External Faculty".
    return StaffProfile.objects.filter(status__icontains='EXTERNAL').select_related('user', 'department')


def _serialize_external_staff(staff_qs, strict: bool):
    staff_qs = _apply_strict_filter(staff_qs, strict).order_by('staff_id')
    serializer = ExternalStaffSerializer(staff_qs, many=True)
    return serializer.data


def _serialize_local_external_staff(strict: bool):
<<<<<<< HEAD
    staff = ExtStaffProfile.objects.filter(is_active=True).select_related('user')
    if strict:
        staff = staff.exclude(user__email__iendswith='@example.com').exclude(user__email__exact='')
    staff = staff.order_by('external_id')
    serializer = ExternalStaffSerializer(staff, many=True)
    return serializer.data
=======
    staff = StaffProfile.objects.filter(status__iexact='EXTERNAL').select_related('user', 'department')
    return _serialize_external_staff(staff, strict)


def _serialize_admin_source_staff(strict: bool):
    return _serialize_external_staff(_admin_source_queryset(), strict)
>>>>>>> 0803e45 (Questionbank)


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
        try:
            from academics.models import ExtStaffProfile as AcademicExtStaffProfile
        except Exception:
            return Response([])

        rows = AcademicExtStaffProfile.objects.select_related('user').order_by('-created_at')
        results = []
        for row in rows:
            user = getattr(row, 'user', None)
            first_name = ''
            last_name = ''
            if user is not None:
                first_name = getattr(user, 'first_name', '') or ''
                last_name = getattr(user, 'last_name', '') or ''

            if not (first_name or last_name):
                full_name = (getattr(user, 'get_full_name', lambda: '')() if user else '') or getattr(user, 'username', '') if user else ''
                parts = [p for p in str(full_name).split(' ') if p]
                if parts:
                    first_name = ' '.join(parts[:-1]) if len(parts) > 1 else parts[0]
                    last_name = parts[-1] if len(parts) > 1 else ''

            email = getattr(user, 'email', '') if user else ''
            if strict and (not email or str(email).lower().endswith('@example.com')):
                continue

            results.append({
                'id': row.id,
                'staff_id': str(getattr(row, 'faculty_id', '') or (getattr(user, 'username', '') if user else '') or row.id),
                'first_name': first_name,
                'last_name': last_name,
                'email': email,
                'department_name': str(getattr(row, 'department', '') or 'General'),
                'login_code': str(getattr(row, 'ext_uid', '') or ''),
                'status': 'ACTIVE' if getattr(row, 'is_active', False) else 'INACTIVE',
            })

        return Response(results)


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
<<<<<<< HEAD
        # ExtStaffProfile doesn't have a login_code field yet.
        # For now, return a count of external staff as a placeholder.
        staff_list = ExtStaffProfile.objects.filter(is_active=True)
        count = staff_list.count()
=======
        strict = str(request.query_params.get('strict', '1')).lower() in ('1', 'true', 'yes')
        staff_list = _apply_strict_filter(_admin_source_queryset(), strict)
        updated_count = 0
        
        with transaction.atomic():
            for staff in staff_list:
                # Generate random 6-digit alphanumeric code if not already assigned
                # or always re-assign if requested (here we just assign if empty or as a batch action)
                code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
                staff.login_code = code
                staff.save(update_fields=['login_code'])
                updated_count += 1
        
>>>>>>> 0803e45 (Questionbank)
        return Response({
            'message': f'{count} external staff members found. Login code feature is pending model update.',
            'assigned_count': 0,
        })
