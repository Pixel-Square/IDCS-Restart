from rest_framework import serializers

from .models import Certificate, CertificateAuditLog, CertificateStatus, StudentAchievement


class CertificateAuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True)

    class Meta:
        model = CertificateAuditLog
        fields = ('id', 'action', 'actor', 'actor_username', 'details', 'created_at')


class StudentAchievementSerializer(serializers.ModelSerializer):
    student_reg_no = serializers.CharField(source='student.reg_no', read_only=True)
    student_name = serializers.SerializerMethodField()
    verified_by_username = serializers.SerializerMethodField()
    certificate_file = serializers.SerializerMethodField()
    certificate_status = serializers.SerializerMethodField()

    class Meta:
        model = StudentAchievement
        fields = (
            'id', 'student', 'student_reg_no', 'student_name', 'certificate', 'achievement_type', 'title',
            'description', 'issuing_body', 'date_earned', 'verified_by', 'verified_by_username',
            'verified_at', 'created_at', 'certificate_file', 'certificate_status',
        )

    def get_student_name(self, obj):
        user = getattr(obj.student, 'user', None)
        if not user:
            return None
        full_name = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
        return full_name or getattr(user, 'username', None)

    def get_verified_by_username(self, obj):
        staff = getattr(obj, 'verified_by', None)
        user = getattr(staff, 'user', None)
        return getattr(user, 'username', None) if user else None

    def get_certificate_file(self, obj):
        certificate = getattr(obj, 'certificate', None)
        file_obj = getattr(certificate, 'file', None)
        return getattr(file_obj, 'url', None) if file_obj else None

    def get_certificate_status(self, obj):
        certificate = getattr(obj, 'certificate', None)
        return getattr(certificate, 'status', None)


class CertificateSerializer(serializers.ModelSerializer):
    student_reg_no = serializers.CharField(source='student.reg_no', read_only=True)
    student_name = serializers.SerializerMethodField()
    mentor_username = serializers.SerializerMethodField()
    reviewer_username = serializers.SerializerMethodField()
    achievement = serializers.SerializerMethodField()

    class Meta:
        model = Certificate
        fields = (
            'id', 'student', 'student_reg_no', 'student_name', 'mentor', 'mentor_username', 'certificate_type',
            'title', 'issuing_organization', 'issue_date', 'expiry_date', 'file', 'file_hash', 'status',
            'rejection_reason', 'rejection_message', 'reviewer', 'reviewer_username', 'reviewed_at',
            'created_at', 'updated_at', 'achievement',
        )
        read_only_fields = ('mentor', 'file_hash', 'status', 'reviewer', 'reviewed_at', 'created_at', 'updated_at')

    def get_student_name(self, obj):
        user = getattr(obj.student, 'user', None)
        if not user:
            return None
        full_name = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
        return full_name or getattr(user, 'username', None)

    def get_mentor_username(self, obj):
        user = getattr(getattr(obj, 'mentor', None), 'user', None)
        return getattr(user, 'username', None) if user else None

    def get_reviewer_username(self, obj):
        return getattr(getattr(obj, 'reviewer', None), 'username', None)

    def get_achievement(self, obj):
        achievement = getattr(obj, 'achievement', None)
        if not achievement:
            return None
        return StudentAchievementSerializer(achievement, context=self.context).data


class CertificateUploadSerializer(serializers.Serializer):
    certificate_type = serializers.ChoiceField(choices=Certificate._meta.get_field('certificate_type').choices)
    title = serializers.CharField(max_length=255)
    issuing_organization = serializers.CharField(max_length=255)
    issue_date = serializers.DateField()
    expiry_date = serializers.DateField(required=False, allow_null=True)
    file = serializers.FileField()

    def validate_file(self, value):
        max_bytes = 10 * 1024 * 1024
        if getattr(value, 'size', 0) > max_bytes:
            raise serializers.ValidationError('Certificate file must be 10 MB or smaller.')
        return value


class CertificateReviewSerializer(serializers.Serializer):
    rejection_reason = serializers.ChoiceField(choices=Certificate._meta.get_field('rejection_reason').choices, required=False, allow_blank=True, allow_null=True)
    rejection_message = serializers.CharField(max_length=500, required=False, allow_blank=True)

