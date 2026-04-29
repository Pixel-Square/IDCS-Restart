from django.db.models import Sum
from rest_framework import serializers

from academics.models import TeachingAssignment
from academics.utils import get_user_staff_profile
from lms.models import StaffStorageQuota, StudyMaterial, StudyMaterialDownloadLog


class StudyMaterialSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    uploaded_by_staff_id = serializers.SerializerMethodField()
    course_name = serializers.CharField(source='course.name', read_only=True)
    department_code = serializers.CharField(source='course.department.code', read_only=True)
    subject_code = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()
    download_count = serializers.SerializerMethodField()

    class Meta:
        model = StudyMaterial
        fields = [
            'id',
            'uploaded_by',
            'uploaded_by_name',
            'uploaded_by_staff_id',
            'course',
            'course_name',
            'department_code',
            'subject_code',
            'subject_name',
            'teaching_assignment',
            'curriculum_row',
            'elective_subject',
            'title',
            'co_title',
            'sub_topic',
            'description',
            'material_type',
            'file',
            'original_file_name',
            'file_size_bytes',
            'external_url',
            'download_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'uploaded_by',
            'file_size_bytes',
            'curriculum_row',
            'elective_subject',
        ]

    def get_uploaded_by_name(self, obj):
        try:
            return str(obj.uploaded_by)
        except Exception:
            return ''

    def get_uploaded_by_staff_id(self, obj):
        try:
            return obj.uploaded_by.staff_id
        except Exception:
            return ''

    def get_download_count(self, obj):
        try:
            return int(obj.download_logs.count())
        except Exception:
            return 0

    def get_subject_code(self, obj):
        try:
            if getattr(obj, 'elective_subject', None) and getattr(obj.elective_subject, 'course_code', None):
                return str(obj.elective_subject.course_code).strip()
            if getattr(obj, 'curriculum_row', None) and getattr(obj.curriculum_row, 'course_code', None):
                return str(obj.curriculum_row.course_code).strip()

            ta = getattr(obj, 'teaching_assignment', None)
            if ta is not None:
                if getattr(ta, 'elective_subject', None) and getattr(ta.elective_subject, 'course_code', None):
                    return str(ta.elective_subject.course_code).strip()
                if getattr(ta, 'curriculum_row', None) and getattr(ta.curriculum_row, 'course_code', None):
                    return str(ta.curriculum_row.course_code).strip()
                if getattr(ta, 'subject', None) and getattr(ta.subject, 'code', None):
                    return str(ta.subject.code).strip()
        except Exception:
            pass
        return ''

    def get_subject_name(self, obj):
        try:
            if getattr(obj, 'elective_subject', None) and getattr(obj.elective_subject, 'course_name', None):
                return str(obj.elective_subject.course_name).strip()
            if getattr(obj, 'curriculum_row', None) and getattr(obj.curriculum_row, 'course_name', None):
                return str(obj.curriculum_row.course_name).strip()

            ta = getattr(obj, 'teaching_assignment', None)
            if ta is not None:
                if getattr(ta, 'elective_subject', None) and getattr(ta.elective_subject, 'course_name', None):
                    return str(ta.elective_subject.course_name).strip()
                if getattr(ta, 'curriculum_row', None) and getattr(ta.curriculum_row, 'course_name', None):
                    return str(ta.curriculum_row.course_name).strip()
                if getattr(ta, 'subject', None) and getattr(ta.subject, 'name', None):
                    return str(ta.subject.name).strip()
        except Exception:
            pass
        return ''


class StudyMaterialCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyMaterial
        fields = [
            'course',
            'teaching_assignment',
            'title',
            'co_title',
            'sub_topic',
            'description',
            'material_type',
            'file',
            'external_url',
        ]

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        staff_profile = get_user_staff_profile(user)
        if staff_profile is None:
            raise serializers.ValidationError('Only staff can upload study materials.')

        ta = attrs.get('teaching_assignment')
        if not ta:
            raise serializers.ValidationError({'teaching_assignment': 'Teaching assignment is required.'})
        if ta.staff_id != staff_profile.id or not ta.is_active:
            raise serializers.ValidationError({'teaching_assignment': 'Invalid teaching assignment for this staff.'})

        material_type = attrs.get('material_type')
        upload_file = attrs.get('file')
        external_url = attrs.get('external_url')

        if material_type == StudyMaterial.TYPE_FILE and not upload_file:
            raise serializers.ValidationError({'file': 'File is required for file material.'})
        if material_type == StudyMaterial.TYPE_LINK and not external_url:
            raise serializers.ValidationError({'external_url': 'URL is required for link material.'})

        if attrs.get('sub_topic') in (None, ''):
            attrs['sub_topic'] = 'ALL'

        course = attrs.get('course')
        if ta.section_id and getattr(ta.section.batch, 'course_id', None):
            section_course = ta.section.batch.course
            if course and course.id != section_course.id:
                raise serializers.ValidationError({'course': 'Course must match teaching assignment section course.'})
            attrs['course'] = section_course
        elif not course:
            raise serializers.ValidationError({'course': 'Course is required for this teaching assignment.'})

        quota, _ = StaffStorageQuota.objects.get_or_create(staff=staff_profile)
        used_bytes = StudyMaterial.objects.filter(
            uploaded_by=staff_profile,
            material_type=StudyMaterial.TYPE_FILE,
        ).aggregate(total=Sum('file_size_bytes')).get('total') or 0

        incoming_size = 0
        if material_type == StudyMaterial.TYPE_FILE and upload_file is not None:
            incoming_size = int(getattr(upload_file, 'size', 0) or 0)

        if int(used_bytes) + incoming_size > int(quota.quota_bytes):
            raise serializers.ValidationError(
                {
                    'file': (
                        f'Upload exceeds allocated space. Used={int(used_bytes)} bytes, '
                        f'quota={int(quota.quota_bytes)} bytes.'
                    )
                }
            )

        return attrs

    def create(self, validated_data):
        request = self.context['request']
        staff_profile = get_user_staff_profile(request.user)
        if staff_profile is None:
            raise serializers.ValidationError('Only staff can upload study materials.')
        ta: TeachingAssignment = validated_data['teaching_assignment']

        validated_data['uploaded_by'] = staff_profile
        validated_data['curriculum_row'] = getattr(ta, 'curriculum_row', None)
        validated_data['elective_subject'] = getattr(ta, 'elective_subject', None)

        if not validated_data.get('title'):
            if validated_data.get('material_type') == StudyMaterial.TYPE_FILE and validated_data.get('file'):
                validated_data['title'] = str(validated_data['file'].name)
            elif validated_data.get('material_type') == StudyMaterial.TYPE_LINK:
                validated_data['title'] = str(validated_data.get('external_url') or '').strip()[:255]

        if not validated_data.get('co_title'):
            validated_data['co_title'] = str(validated_data.get('title') or '').strip()[:255]

        shared_ta_ids = request.data.get('shared_ta_ids')
        shared_course_ids = request.data.get('shared_course_ids')
        
        obj = super().create(validated_data)
        
        if shared_course_ids:
            c_ids = [int(x.strip()) for x in str(shared_course_ids).split(',') if x.strip().isdigit()]
            if c_ids:
                obj.shared_courses.set(c_ids)
        if shared_ta_ids:
            ta_ids = [int(x.strip()) for x in str(shared_ta_ids).split(',') if x.strip().isdigit()]
            if ta_ids:
                obj.shared_teaching_assignments.set(ta_ids)
                
        return obj


class StaffQuotaSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()
    staff_id = serializers.CharField(source='staff.staff_id', read_only=True)
    used_bytes = serializers.SerializerMethodField()

    class Meta:
        model = StaffStorageQuota
        fields = [
            'id',
            'staff',
            'staff_id',
            'staff_name',
            'quota_bytes',
            'used_bytes',
            'updated_at',
        ]
        read_only_fields = ['staff', 'staff_id', 'staff_name', 'used_bytes', 'updated_at']

    def get_staff_name(self, obj):
        try:
            return str(obj.staff)
        except Exception:
            return ''

    def get_used_bytes(self, obj):
        return int(obj.used_bytes)


class StudyMaterialDownloadLogSerializer(serializers.ModelSerializer):
    material_title = serializers.CharField(source='material.title', read_only=True)
    material_course_name = serializers.CharField(source='material.course.name', read_only=True)
    user_name = serializers.SerializerMethodField()
    user_profile_type = serializers.SerializerMethodField()

    class Meta:
        model = StudyMaterialDownloadLog
        fields = [
            'id',
            'material',
            'material_title',
            'material_course_name',
            'downloaded_by',
            'user_name',
            'user_profile_type',
            'client_ip',
            'user_agent',
            'downloaded_at',
        ]

    def get_user_name(self, obj):
        try:
            u = obj.downloaded_by
            if not u:
                return ''
            name = f"{u.first_name or ''} {u.last_name or ''}".strip()
            return name or str(u.username or '')
        except Exception:
            return ''

    def get_user_profile_type(self, obj):
        if obj.downloaded_by_student_id:
            return 'STUDENT'
        if obj.downloaded_by_staff_id:
            return 'STAFF'
        return ''
