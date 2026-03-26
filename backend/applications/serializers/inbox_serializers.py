from rest_framework import serializers
from django.conf import settings

from applications import models as app_models


class ApproverInboxItemSerializer(serializers.Serializer):
    application_id = serializers.IntegerField(source='id')
    application_type = serializers.CharField(source='application_type.name')
    applicant_name = serializers.SerializerMethodField()
    applicant_roll_or_staff_id = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    current_step_role = serializers.SerializerMethodField()
    submitted_at = serializers.DateTimeField()
    current_state = serializers.CharField()
    applicant_profile_image = serializers.SerializerMethodField()
    applicant_kind = serializers.SerializerMethodField()

    def get_applicant_profile_image(self, obj):
        req = self.context.get('request')

        def to_abs(url_or_path):
            if not url_or_path:
                return None
            if url_or_path.startswith('http://') or url_or_path.startswith('https://'):
                return url_or_path
            if req:
                return req.build_absolute_uri(url_or_path)
            return url_or_path

        try:
            sp = getattr(obj, 'student_profile', None)
            if sp and getattr(sp, 'profile_image', None):
                return to_abs(sp.profile_image.url)

            st = getattr(obj, 'staff_profile', None)
            if st and getattr(st, 'profile_image', None):
                return to_abs(st.profile_image.url)

            user = getattr(obj, 'applicant_user', None)
            user_path = getattr(user, 'profile_image', '') if user else ''
            if user_path:
                media_url = settings.MEDIA_URL or '/media/'
                rel = f"{media_url.rstrip('/')}/{str(user_path).lstrip('/')}"
                return to_abs(rel)
        except Exception:
            return None
        return None

    def get_applicant_name(self, obj):
        user = getattr(obj, 'applicant_user', None)
        if not user:
            return ''
        full = getattr(user, 'get_full_name', lambda: '')() or ''
        full = full.strip()
        if full:
            return full
        return getattr(user, 'username', None) or str(user)

    def get_applicant_kind(self, obj):
        if getattr(obj, 'student_profile', None):
            return 'STUDENT'
        if getattr(obj, 'staff_profile', None):
            return 'STAFF'
        return None

    def get_applicant_roll_or_staff_id(self, obj):
        if getattr(obj, 'student_profile', None):
            return getattr(obj.student_profile, 'reg_no', None)
        if getattr(obj, 'staff_profile', None):
            return getattr(obj.staff_profile, 'staff_id', None)
        return None

    def get_department_name(self, obj):
        sec = getattr(obj, 'student_profile', None) and getattr(obj.student_profile, 'section', None)
        if sec and getattr(sec, 'batch', None) and getattr(sec.batch, 'course', None):
            dept = sec.batch.course.department
            return getattr(dept, 'name', None)
        # staff_profile department
        if getattr(obj, 'staff_profile', None):
            return getattr(obj.staff_profile, 'department', None) and getattr(obj.staff_profile.department, 'name', None)
        return None

    def get_current_step_role(self, obj):
        step = getattr(obj, 'current_step', None)
        if not step:
            return None
        if getattr(step, 'stage_id', None):
            return getattr(step.stage, 'name', None)
        return getattr(step.role, 'name', None) if getattr(step, 'role_id', None) else None
