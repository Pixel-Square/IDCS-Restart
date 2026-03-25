from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta

from academics.models import Department, Section

from .models import Announcement, AnnouncementReadStatus
from .services import ROLE_HOD, ROLE_IQAC, ROLE_STAFF, ROLE_STUDENT, get_actor_role, get_allowed_target_roles


ALLOWED_ATTACHMENT_EXTENSIONS = ('.pdf', '.png', '.jpg', '.jpeg')
EXPIRY_OPTIONS = {
    '1W': timedelta(weeks=1),
    '1M': timedelta(days=30),
    '3M': timedelta(days=90),
    '6M': timedelta(days=180),
    '1Y': timedelta(days=365),
}


class AnnouncementListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    created_by_role = serializers.SerializerMethodField()
    created_by_label = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    target_roles = serializers.ListField(child=serializers.CharField(), read_only=True)
    class_id = serializers.IntegerField(source='target_class_id', read_only=True)
    class_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    target_department_ids = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            'id',
            'title',
            'content',
            'target_type',
            'target_roles',
            'department',
            'department_name',
            'class_id',
            'class_name',
            'created_by',
            'created_by_name',
            'created_by_role',
            'created_by_label',
            'created_at',
            'is_active',
            'is_read',
            'target_department_ids',
            'attachment_url',
            'expiry_date',
            'is_expired',
        ]
        read_only_fields = fields

    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            if obj.created_by_id == request.user.id:
                return True
            annotated = getattr(obj, 'user_is_read', None)
            if annotated is not None:
                return bool(annotated)
            status = AnnouncementReadStatus.objects.filter(announcement=obj, user=request.user).first()
            return bool(status and status.is_read)
        return False

    def get_created_by_role(self, obj):
        try:
            roles = list(obj.created_by.roles.values_list('name', flat=True))
        except Exception:
            roles = []
        if not roles:
            return 'USER'
        role_priority = ['PRINCIPAL', 'IQAC', 'HOD', 'STAFF', 'STUDENT']
        upper_roles = [str(r or '').strip().upper() for r in roles]
        for role in role_priority:
            if role in upper_roles:
                return role
        return upper_roles[0]

    def get_created_by_label(self, obj):
        return f"{self.get_created_by_role(obj)} / {obj.created_by.username}"

    def get_class_name(self, obj):
        target_class = getattr(obj, 'target_class', None)
        return str(target_class) if target_class else None

    def get_department_name(self, obj):
        department = getattr(obj, 'department', None)
        return getattr(department, 'name', None) if department else None

    def get_target_department_ids(self, obj):
        return list(obj.target_departments.values_list('id', flat=True))

    def get_attachment_url(self, obj):
        request = self.context.get('request')
        attachment = getattr(obj, 'attachment', None)
        if not attachment:
            return None
        try:
            url = attachment.url
        except Exception:
            return None
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def get_is_expired(self, obj):
        return bool(getattr(obj, 'is_expired', False))


class AnnouncementCreateSerializer(serializers.ModelSerializer):
    attachment = serializers.FileField(required=False, allow_null=True)
    tag = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    target_roles = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), required=False, allow_null=True)
    class_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    department_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    expires_in = serializers.ChoiceField(
        choices=['1W', '1M', '3M', '6M', '1Y'],
        required=False,
        write_only=True,
        default='1M',
    )

    class Meta:
        model = Announcement
        fields = [
            'title',
            'content',
            'attachment',
            'tag',
            'target_type',
            'target_roles',
            'department',
            'department_ids',
            'class_id',
            'expires_in',
            'expiry_date',
            'is_active',
        ]

    def validate_target_roles(self, value):
        return [str(v).upper() for v in value if v]

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        # Normalize incoming types/roles for stability against UI case mismatches
        roles = attrs.get('target_roles') or []
        normalized_roles = [str(r or '').strip().upper() for r in roles if str(r or '').strip()]
        attrs['target_roles'] = normalized_roles
        if 'target_type' in attrs and attrs['target_type'] is not None:
            attrs['target_type'] = str(attrs['target_type']).strip().upper()

        class_id = attrs.pop('class_id', None)
        department_ids = attrs.pop('department_ids', None) or []
        expires_in = attrs.pop('expires_in', None)
        if class_id:
            target_class = Section.objects.filter(id=class_id).first()
            if not target_class:
                raise serializers.ValidationError({'class_id': 'Invalid class id.'})
            attrs['target_class'] = target_class

        department_qs = None
        if department_ids:
            department_qs = Department.objects.filter(id__in=department_ids)

        target_type = attrs.get('target_type')

        if user and getattr(user, 'is_authenticated', False):
            actor_role = get_actor_role(user=user)
            allowed_target_roles = set(get_allowed_target_roles(user))

            if actor_role == ROLE_STUDENT:
                raise serializers.ValidationError({'detail': 'Students cannot create announcements'})

            invalid_roles = [r for r in normalized_roles if r not in allowed_target_roles]
            if invalid_roles:
                raise serializers.ValidationError({'target_roles': f"Invalid target roles: {', '.join(invalid_roles)}"})

            if actor_role == ROLE_STAFF and target_type != Announcement.TARGET_CLASS:
                raise serializers.ValidationError({'target_type': 'Staff can only send to their class'})

            if actor_role == ROLE_HOD and 'IQAC' in normalized_roles:
                raise serializers.ValidationError({'target_roles': 'HOD cannot target IQAC'})

            if actor_role == ROLE_STAFF and any(r in {'HOD', 'IQAC', 'STAFF'} for r in normalized_roles):
                raise serializers.ValidationError({'target_roles': 'Staff can only target students'})

            attrs['target_roles'] = normalized_roles

        attachment = attrs.get('attachment')
        if attachment:
            name = str(getattr(attachment, 'name', '')).lower()
            if not any(name.endswith(ext) for ext in ALLOWED_ATTACHMENT_EXTENSIONS):
                raise serializers.ValidationError({'attachment': 'Only PDF, PNG, JPG, and JPEG files are allowed.'})

        if expires_in:
            attrs['expiry_date'] = timezone.now() + EXPIRY_OPTIONS[str(expires_in)]
        elif self.instance is None and not attrs.get('expiry_date'):
            attrs['expiry_date'] = timezone.now() + EXPIRY_OPTIONS['1M']

        attrs['_target_departments_qs'] = department_qs
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        target_departments_qs = validated_data.pop('_target_departments_qs', None)
        # DB in some environments currently enforces tag as NOT NULL.
        # Keep writes safe until all environments are migrated consistently.
        if validated_data.get('tag') in (None, ''):
            validated_data['tag'] = 'GENERAL'
        # If department targeting uses only M2M, ensure a primary department is set so model clean passes
        if (
            validated_data.get('target_type') == Announcement.TARGET_DEPARTMENT
            and not validated_data.get('department')
            and target_departments_qs is not None
            and target_departments_qs.exists()
        ):
            validated_data['department'] = target_departments_qs.first()
        if request and getattr(request, 'user', None):
            validated_data['created_by'] = request.user
        announcement = Announcement.objects.create(**validated_data)
        if target_departments_qs is not None:
            announcement.target_departments.set(target_departments_qs)
        return announcement

    def update(self, instance, validated_data):
        target_departments_qs = validated_data.pop('_target_departments_qs', None)
        if validated_data.get('tag') is None:
            validated_data['tag'] = instance.tag or 'GENERAL'
        updated = super().update(instance, validated_data)
        if target_departments_qs is not None:
            updated.target_departments.set(target_departments_qs)
            if not updated.department_id and target_departments_qs.exists():
                updated.department = target_departments_qs.first()
                updated.save(update_fields=['department'])
        return updated


class AnnouncementUpdateSerializer(AnnouncementCreateSerializer):
    pass


class AnnouncementReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnnouncementReadStatus
        fields = ['announcement', 'is_read', 'read_at']
        read_only_fields = ['read_at']
