from rest_framework import serializers

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

    def get_applicant_name(self, obj):
        return getattr(obj.applicant_user, 'get_full_name', lambda: str(obj.applicant_user))()

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
        return getattr(obj.current_step, 'role', None) and getattr(obj.current_step.role, 'name', None)
