"""
Academic 2.1 Serializers
"""

import base64
from django.core.files.base import ContentFile
from django.utils.crypto import get_random_string
from rest_framework import serializers
from .models import (
    AcV2SemesterConfig,
    AcV2ClassType,
    Weigthts,
    AcV2QpPattern,
    AcV2Course,
    AcV2Section,
    AcV2ExamAssignment,
    AcV2StudentMark,
    AcV2UserPatternOverride,
    AcV2EditRequest,
    AcV2InternalMark,
    AcV2QpType,
    AcV2Cycle,
)


class AcV2SemesterConfigSerializer(serializers.ModelSerializer):
    semester_name = serializers.CharField(source='semester.name', read_only=True)
    is_open = serializers.SerializerMethodField()
    time_remaining_seconds = serializers.SerializerMethodField()
    # Accept base64 data URL (or raw base64) and store it in seal_image
    seal_image_base64 = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    class Meta:
        model = AcV2SemesterConfig
        fields = [
            'id', 'semester', 'semester_name',
            'publish_control_enabled', 'approval_workflow', 'approval_window_minutes',
            'edit_request_validity_hours', 'approval_until_publish',
            'open_from', 'due_at', 'auto_publish_on_due',
            'seal_animation_enabled', 'seal_watermark_enabled', 'seal_image', 'seal_image_base64',
            'is_open', 'time_remaining_seconds',
            'updated_by', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

    def _apply_seal_image_base64(self, instance: AcV2SemesterConfig, raw: str | None):
        if raw is None:
            return

        data = str(raw)

        # Explicit clear
        if data == '':
            if instance.seal_image:
                instance.seal_image.delete(save=False)
            instance.seal_image = None
            return

        # Only accept base64; ignore URLs/paths
        if data.startswith('http://') or data.startswith('https://') or data.startswith('/'):
            return

        mime = None
        b64 = data
        if data.startswith('data:') and ';base64,' in data:
            header, b64 = data.split(';base64,', 1)
            # header looks like: data:image/png
            mime = header.split(':', 1)[1] if ':' in header else None

        try:
            decoded = base64.b64decode(b64, validate=True)
        except Exception:
            raise serializers.ValidationError({'seal_image_base64': 'Invalid base64 image data'})

        # Basic size guard (2MB)
        if len(decoded) > 2 * 1024 * 1024:
            raise serializers.ValidationError({'seal_image_base64': 'Image size must be less than 2MB'})

        ext = 'png'
        if mime:
            m = mime.lower()
            if 'jpeg' in m or 'jpg' in m:
                ext = 'jpg'
            elif 'webp' in m:
                ext = 'webp'
            elif 'gif' in m:
                ext = 'gif'
            elif 'png' in m:
                ext = 'png'

        # Remove old file to avoid orphaned uploads
        if instance.seal_image:
            instance.seal_image.delete(save=False)

        filename = f"seal_{instance.semester_id}_{get_random_string(8)}.{ext}"
        instance.seal_image.save(filename, ContentFile(decoded), save=False)

    def create(self, validated_data):
        seal_b64 = validated_data.pop('seal_image_base64', None)
        instance = super().create(validated_data)
        self._apply_seal_image_base64(instance, seal_b64)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        seal_b64 = validated_data.pop('seal_image_base64', None)
        instance = super().update(instance, validated_data)
        self._apply_seal_image_base64(instance, seal_b64)
        instance.save()
        return instance
    
    def get_is_open(self, obj):
        return obj.is_open()
    
    def get_time_remaining_seconds(self, obj):
        remaining = obj.time_remaining()
        if remaining:
            return int(remaining.total_seconds())
        return None


class AcV2ClassTypeSerializer(serializers.ModelSerializer):
    enabled_exams = serializers.SerializerMethodField()
    total_weight = serializers.SerializerMethodField()
    
    class Meta:
        model = AcV2ClassType
        fields = [
            'id', 'name', 'short_code', 'display_name',
            'total_internal_marks', 'allow_customize_questions',
            'exam_assignments', 'default_co_count',
            'enabled_exams', 'total_weight',
            'is_active', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']
        # Suppress auto-generated unique validators so updates don't
        # falsely reject an unchanged name on the same instance.
        validators = []
    
    def validate_name(self, value):
        """Check uniqueness manually, excluding the current instance on updates."""
        instance = self.instance
        qs = AcV2ClassType.objects.filter(name__iexact=value)
        if instance is not None:
            qs = qs.exclude(pk=instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Class Type with this name already exists.")
        return value

    def get_enabled_exams(self, obj):
        return obj.get_enabled_exams()
    
    def get_total_weight(self, obj):
        return obj.get_total_weight()

    def update(self, instance, validated_data):
        exam_assignments_provided = 'exam_assignments' in validated_data
        instance = super().update(instance, validated_data)

        # Mirror Weightage config into a normalized DB table for reporting/debug.
        if exam_assignments_provided:
            try:
                Weigthts.objects.filter(class_type=instance).delete()

                rows = []
                for ea in (instance.exam_assignments or []):
                    if not isinstance(ea, dict):
                        continue
                    qp_type = (ea.get('qp_type') or '').strip()
                    exam = (ea.get('exam') or '').strip()
                    if not exam:
                        continue

                    # CQI is a config-only entry; do not mirror into Weigthts.
                    if str(ea.get('kind') or '').strip().lower() == 'cqi' or ea.get('is_cqi') is True or exam.strip().upper() == 'CQI':
                        continue

                    co_weights = ea.get('co_weights') if isinstance(ea.get('co_weights'), dict) else {}
                    default_cos = ea.get('default_cos') if isinstance(ea.get('default_cos'), list) else []

                    mm_with = ea.get('mm_co_weights_with_exam')
                    mm_without = ea.get('mm_co_weights_without_exam')
                    mm_exam_weight = ea.get('mm_exam_weight')

                    # Backward compatibility: allow nested keys
                    if not mm_with and isinstance(ea.get('mm_with_exam'), dict):
                        mm_with = ea.get('mm_with_exam', {}).get('co_weights')
                        mm_exam_weight = ea.get('mm_with_exam', {}).get('exam_weight', mm_exam_weight)
                    if not mm_without and isinstance(ea.get('mm_without_exam'), dict):
                        mm_without = ea.get('mm_without_exam', {}).get('co_weights')

                    rows.append(Weigthts(
                        class_type=instance,
                        qp_type=qp_type,
                        exam=exam,
                        exam_display_name=(ea.get('exam_display_name') or '').strip(),
                        weight=ea.get('weight') or 0,
                        co_weights=co_weights,
                        default_cos=default_cos,
                        mark_manager_enabled=bool(ea.get('mark_manager_enabled', False)),
                        mm_co_weights_with_exam=mm_with if isinstance(mm_with, dict) else {},
                        mm_co_weights_without_exam=mm_without if isinstance(mm_without, dict) else {},
                        mm_exam_weight=mm_exam_weight or 0,
                        updated_by=getattr(self.context.get('request'), 'user', None),
                    ))

                if rows:
                    Weigthts.objects.bulk_create(rows)
            except Exception:
                # Non-critical: do not block class type updates if mirror sync fails
                pass

        return instance


class AcV2QpPatternSerializer(serializers.ModelSerializer):
    class_type_name = serializers.CharField(source='class_type.name', read_only=True, allow_null=True)
    questions = serializers.SerializerMethodField()
    
    class Meta:
        model = AcV2QpPattern
        fields = [
            'id', 'name', 'default_weight', 'qp_type', 'class_type', 'class_type_name',
            'pattern', 'questions', 'order',
            'batch', 'cycle', 'is_active', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']
    
    def get_questions(self, obj):
        return obj.get_questions()


class AcV2CourseSerializer(serializers.ModelSerializer):
    class_type_info = AcV2ClassTypeSerializer(source='class_type', read_only=True)
    
    class Meta:
        model = AcV2Course
        fields = [
            'id', 'subject', 'semester',
            'subject_code', 'subject_name',
            'class_type', 'class_type_info', 'class_type_name',
            'question_paper_type', 'co_count', 'co_titles',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcV2SectionSerializer(serializers.ModelSerializer):
    course_info = AcV2CourseSerializer(source='course', read_only=True)
    faculty_name = serializers.CharField(source='faculty_user.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = AcV2Section
        fields = [
            'id', 'course', 'course_info',
            'teaching_assignment', 'section_name',
            'faculty_user', 'faculty_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcV2ExamAssignmentSerializer(serializers.ModelSerializer):
    section_info = AcV2SectionSerializer(source='section', read_only=True)
    is_editable = serializers.SerializerMethodField()
    is_past_due = serializers.SerializerMethodField()
    publish_control = serializers.SerializerMethodField()
    question_btls = serializers.SerializerMethodField()
    class_type = serializers.SerializerMethodField()
    class_type_name = serializers.SerializerMethodField()
    name = serializers.CharField(source='exam_display_name', read_only=True)
    
    class Meta:
        model = AcV2ExamAssignment
        fields = [
            'id', 'section', 'section_info',
            'exam', 'exam_display_name', 'name', 'qp_type',
            'max_marks', 'weight', 'covered_cos',
            'qp_pattern', 'pattern', 'allow_customize',
            'status', 'draft_data', 'published_data',
            'published_at', 'published_by',
            'has_pending_edit_request', 'edit_window_until',
            'last_saved_at', 'last_saved_by',
            'is_editable', 'is_past_due', 'publish_control',
            'question_btls', 'class_type', 'class_type_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'published_at', 'published_by']
    
    def get_question_btls(self, obj):
        draft = obj.draft_data if isinstance(obj.draft_data, dict) else {}
        return draft.get('question_btls', {})
    
    def get_is_editable(self, obj):
        return obj.is_editable()
    
    def get_is_past_due(self, obj):
        return obj.is_past_due()
    
    def get_publish_control(self, obj):
        from .services.publish_control import check_publish_control
        ctrl = check_publish_control(obj)
        # Convert timedelta to seconds
        if ctrl.get('time_remaining'):
            ctrl['time_remaining_seconds'] = int(ctrl['time_remaining'].total_seconds())
            del ctrl['time_remaining']
        return ctrl
    
    def get_class_type(self, obj):
        """Get class_type ID from nested section.course"""
        try:
            return str(obj.section.course.class_type.id) if obj.section.course.class_type else None
        except Exception:
            return None
    
    def get_class_type_name(self, obj):
        """Get class_type name from nested section.course"""
        try:
            return obj.section.course.class_type.name if obj.section.course.class_type else None
        except Exception:
            return None


class AcV2StudentMarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcV2StudentMark
        fields = [
            'id', 'exam_assignment',
            'student', 'reg_no', 'student_name',
            'co1_mark', 'co2_mark', 'co3_mark', 'co4_mark', 'co5_mark',
            'total_mark', 'weighted_mark',
            'question_marks',
            'is_absent', 'is_exempted', 'remarks',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcV2StudentMarkBulkSerializer(serializers.Serializer):
    """Serializer for bulk mark entry."""
    marks = serializers.ListField(
        child=serializers.DictField()
    )


class AcV2EditRequestSerializer(serializers.ModelSerializer):
    exam_info = serializers.SerializerMethodField()
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    requested_by_username = serializers.SerializerMethodField()
    requested_by_staff_id = serializers.SerializerMethodField()
    requested_by_profile_image = serializers.SerializerMethodField()
    
    class Meta:
        model = AcV2EditRequest
        fields = [
            'id', 'exam_assignment', 'exam_info',
            'requested_by', 'requested_by_name', 'requested_by_username', 'requested_by_staff_id', 'requested_by_profile_image',
            'requested_at',
            'reason', 'status', 'current_stage',
            'approval_history', 'approved_until',
            'reviewed_by', 'reviewed_at', 'rejection_reason',
        ]
        read_only_fields = ['id', 'requested_at', 'reviewed_at']
    
    def get_exam_info(self, obj):
        ea = obj.exam_assignment
        dept = None
        try:
            ta = getattr(ea.section, 'teaching_assignment', None)
            acad_section = getattr(ta, 'section', None) if ta else None
            if acad_section is not None:
                dept = getattr(acad_section, 'managing_department', None) or getattr(getattr(acad_section, 'batch', None), 'department', None)
        except Exception:
            dept = None

        return {
            'exam': ea.exam,
            'subject_code': ea.section.course.subject_code,
            'subject_name': ea.section.course.subject_name,
            'section_name': ea.section.section_name,
            'department_code': getattr(dept, 'code', '') or '',
            'department_name': getattr(dept, 'name', '') or '',
            'department_short_name': getattr(dept, 'short_name', '') or '',
        }

    def get_requested_by_username(self, obj):
        try:
            return str(getattr(obj.requested_by, 'username', '') or '')
        except Exception:
            return ''

    def get_requested_by_staff_id(self, obj):
        try:
            from academics.models import StaffProfile
            profile = StaffProfile.objects.filter(user=obj.requested_by).first()
            return profile.staff_id if profile and getattr(profile, 'staff_id', None) else (getattr(obj.requested_by, 'username', '') or '')
        except Exception:
            return getattr(obj.requested_by, 'username', '') or ''

    def get_requested_by_profile_image(self, obj):
        value = ''

        try:
            student_profile = getattr(obj.requested_by, 'student_profile', None)
            if student_profile is not None and getattr(student_profile, 'profile_image', None):
                value = str(student_profile.profile_image)
        except Exception:
            value = ''

        if not value:
            try:
                staff_profile = getattr(obj.requested_by, 'staff_profile', None)
                if staff_profile is not None and getattr(staff_profile, 'profile_image', None):
                    value = str(staff_profile.profile_image)
            except Exception:
                value = ''

        if not value:
            value = str(getattr(obj.requested_by, 'profile_image', '') or '')

        value = value.strip()
        if not value:
            return ''

        if value.startswith('http://') or value.startswith('https://'):
            return value

        cleaned = value.lstrip('/')
        return f'/media/{cleaned}'


class AcV2InternalMarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcV2InternalMark
        fields = [
            'id', 'section', 'student',
            'reg_no', 'student_name',
            'weighted_marks',
            'co1_total', 'co2_total', 'co3_total', 'co4_total', 'co5_total',
            'final_mark', 'max_mark',
            'computed_at',
        ]
        read_only_fields = '__all__'


class AcV2UserPatternOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcV2UserPatternOverride
        fields = [
            'id', 'course', 'exam_type',
            'created_by', 'pattern',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']


class AcV2QpTypeSerializer(serializers.ModelSerializer):
    """Serializer for QP Type (Question Paper Type)"""
    class_type_name = serializers.CharField(source='class_type.name', read_only=True)
    
    class Meta:
        model = AcV2QpType
        fields = [
            'id', 'name', 'code', 'description',
            'class_type', 'class_type_name',
            'is_active', 'college',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcV2CycleSerializer(serializers.ModelSerializer):
    """Serializer for Academic Cycle"""

    class Meta:
        model = AcV2Cycle
        fields = [
            'id', 'name', 'code', 'description',
            'college', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
