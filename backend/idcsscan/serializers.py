from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework import serializers

import base64

from academics.models import StaffProfile
from accounts.models import Role
from idcsscan.models import FingerprintEnrollment


class SecurityStaffProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False)
    first_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    email = serializers.EmailField(write_only=True, required=False)

    user_username = serializers.CharField(source='user.username', read_only=True)
    user_first_name = serializers.CharField(source='user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='user.last_name', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_roles = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StaffProfile
        fields = [
            'id',
            'staff_id',
            'department',
            'designation',
            'status',
            'mobile_number',
            'mobile_number_verified_at',
            'profile_image',
            'rfid_uid',
            'username',
            'password',
            'first_name',
            'last_name',
            'email',
            'user_username',
            'user_first_name',
            'user_last_name',
            'user_email',
            'user_roles',
        ]
        read_only_fields = ['id', 'mobile_number_verified_at']

    def get_user_roles(self, obj):
        try:
            return [r.name for r in obj.user.roles.all()]
        except Exception:
            return []

    def _ensure_security_role(self, user):
        role, _ = Role.objects.get_or_create(name='SECURITY', defaults={'description': 'Security role'})
        user.roles.add(role)

    def create(self, validated_data):
        User = get_user_model()

        username = validated_data.pop('username', None)
        password = validated_data.pop('password', None)
        email = validated_data.pop('email', None)
        first_name = validated_data.pop('first_name', '')
        last_name = validated_data.pop('last_name', '')

        if not username:
            raise serializers.ValidationError({'username': 'Username is required.'})
        if not password:
            raise serializers.ValidationError({'password': 'Password is required.'})
        if not email:
            raise serializers.ValidationError({'email': 'Email is required.'})

        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    username=username,
                    password=password,
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                )
                self._ensure_security_role(user)
                return StaffProfile.objects.create(user=user, **validated_data)
        except IntegrityError as exc:
            raise serializers.ValidationError({'detail': f'Unable to create security user: {exc}'})

    def update(self, instance, validated_data):
        User = get_user_model()

        username = validated_data.pop('username', None)
        password = validated_data.pop('password', None)
        email = validated_data.pop('email', None)
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)

        user = instance.user

        if username is not None:
            if User.objects.filter(username=username).exclude(pk=user.pk).exists():
                raise serializers.ValidationError({'username': 'A user with this username already exists.'})
            user.username = username

        if email is not None:
            if User.objects.filter(email=email).exclude(pk=user.pk).exists():
                raise serializers.ValidationError({'email': 'A user with this email already exists.'})
            user.email = email

        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
        if password:
            user.set_password(password)

        with transaction.atomic():
            user.save()
            self._ensure_security_role(user)

            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

        return instance


# ───────────────────────────────────── Fingerprint ─────────────────────────────


class FingerprintEnrollmentReadSerializer(serializers.ModelSerializer):
    """Read-only representation of an enrollment (no raw template bytes)."""

    finger_display = serializers.CharField(source="get_finger_display", read_only=True)
    format_display = serializers.CharField(source="get_template_format_display", read_only=True)
    user_identifier = serializers.SerializerMethodField()

    class Meta:
        model = FingerprintEnrollment
        fields = [
            "id",
            "user",
            "user_identifier",
            "finger",
            "finger_display",
            "template_format",
            "format_display",
            "quality_score",
            "enrolled_at",
            "enrolled_by",
            "device_type",
            "is_active",
            "deactivated_at",
        ]
        read_only_fields = fields

    def get_user_identifier(self, obj) -> str:
        user = obj.user
        # Student → reg_no, Staff → staff_id, else username
        if hasattr(user, "student_profile"):
            return user.student_profile.reg_no
        if hasattr(user, "staff_profile"):
            return user.staff_profile.staff_id
        return user.username


class FingerprintEnrollmentWriteSerializer(serializers.Serializer):
    """
    Accepts base64-encoded template data for enrollment.

    Expected payload:
      {
        "user_id": 42,                    # or "reg_no" / "staff_id"
        "reg_no": "811722104001",          # alternative to user_id
        "staff_id": "100123",              # alternative to user_id
        "finger": "R_INDEX",
        "template_b64": "<base64 string>",
        "template_format": "ISO_19794_2",  # optional, default ISO
        "quality_score": 82,               # optional
        "device_type": "SecuGen-Hamster",  # optional
      }
    """

    user_id = serializers.IntegerField(required=False)
    reg_no = serializers.CharField(required=False, allow_blank=True)
    staff_id = serializers.CharField(required=False, allow_blank=True)
    finger = serializers.ChoiceField(choices=FingerprintEnrollment.Finger.choices)
    template_b64 = serializers.CharField(
        help_text="Base64-encoded fingerprint template bytes."
    )
    template_format = serializers.ChoiceField(
        choices=FingerprintEnrollment.TemplateFormat.choices,
        default=FingerprintEnrollment.TemplateFormat.ISO_19794_2,
    )
    quality_score = serializers.IntegerField(required=False, min_value=0, max_value=100)
    device_type = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_template_b64(self, value: str) -> bytes:
        try:
            raw = base64.b64decode(value, validate=True)
        except Exception:
            raise serializers.ValidationError("Invalid base64 data for template.")
        if len(raw) < 16:
            raise serializers.ValidationError("Template too small — probably invalid.")
        if len(raw) > 10_000:
            raise serializers.ValidationError("Template exceeds 10 KB limit.")
        return raw

    def validate(self, attrs):
        User = get_user_model()
        user_id = attrs.get("user_id")
        reg_no = (attrs.get("reg_no") or "").strip()
        staff_id_val = (attrs.get("staff_id") or "").strip()

        user = None
        if user_id:
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                raise serializers.ValidationError({"user_id": "User not found."})
        elif reg_no:
            from academics.models import StudentProfile
            try:
                user = StudentProfile.objects.select_related("user").get(reg_no=reg_no).user
            except StudentProfile.DoesNotExist:
                raise serializers.ValidationError({"reg_no": "Student not found."})
        elif staff_id_val:
            try:
                user = StaffProfile.objects.select_related("user").get(staff_id=staff_id_val).user
            except StaffProfile.DoesNotExist:
                raise serializers.ValidationError({"staff_id": "Staff not found."})
        else:
            raise serializers.ValidationError("Provide one of: user_id, reg_no, or staff_id.")

        attrs["resolved_user"] = user
        return attrs

    def create(self, validated_data):
        user = validated_data["resolved_user"]
        finger = validated_data["finger"]
        template_bytes = validated_data["template_b64"]  # already decoded in validate
        fmt = validated_data.get("template_format", FingerprintEnrollment.TemplateFormat.ISO_19794_2)
        quality = validated_data.get("quality_score")
        device = validated_data.get("device_type", "")
        enrolled_by = self.context.get("request", None)
        enrolled_by_user = enrolled_by.user if enrolled_by and hasattr(enrolled_by, "user") else None

        # True upsert for (user, finger). The model enforces unique(user, finger),
        # so re-enrollment must update the existing row instead of creating a new one.
        with transaction.atomic():
            enrollment = FingerprintEnrollment.objects.filter(user=user, finger=finger).first()
            if enrollment:
                enrollment.template = template_bytes
                enrollment.template_format = fmt
                enrollment.quality_score = quality
                enrollment.enrolled_by = enrolled_by_user
                enrollment.device_type = device
                enrollment.is_active = True
                enrollment.deactivated_at = None
                enrollment.save(
                    update_fields=[
                        "template",
                        "template_format",
                        "quality_score",
                        "enrolled_by",
                        "device_type",
                        "is_active",
                        "deactivated_at",
                    ]
                )
            else:
                enrollment = FingerprintEnrollment.objects.create(
                    user=user,
                    finger=finger,
                    template=template_bytes,
                    template_format=fmt,
                    quality_score=quality,
                    enrolled_by=enrolled_by_user,
                    device_type=device,
                    is_active=True,
                )
        return enrollment
