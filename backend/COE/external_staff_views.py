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
from academics.models import StaffProfile, Department
from django.contrib.auth import get_user_model

User = get_user_model()

class ExternalStaffSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = StaffProfile
        fields = ['id', 'staff_id', 'first_name', 'last_name', 'email', 'department_name', 'login_code', 'status']


def _serialize_local_external_staff(strict: bool):
    staff = StaffProfile.objects.filter(status__iexact='EXTERNAL').select_related('user', 'department')
    if strict:
        # Return only valid external records from DB, excluding placeholder/demo entries.
        staff = staff.exclude(user__email__iendswith='@example.com').exclude(user__email__exact='')
    staff = staff.order_by('staff_id')
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
        strict = str(request.query_params.get('strict', '1')).lower() in ('1', 'true', 'yes')
        staff_list = StaffProfile.objects.filter(status__iexact='EXTERNAL')
        if strict:
            staff_list = staff_list.exclude(user__email__iendswith='@example.com').exclude(user__email__exact='')
        updated_count = 0
        
        with transaction.atomic():
            for staff in staff_list:
                # Generate random 6-digit alphanumeric code if not already assigned
                # or always re-assign if requested (here we just assign if empty or as a batch action)
                code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
                staff.login_code = code
                staff.save(update_fields=['login_code'])
                updated_count += 1
        
        return Response({
            'message': f'Successfully assigned codes to {updated_count} external staff members.',
            'count': updated_count
        })
