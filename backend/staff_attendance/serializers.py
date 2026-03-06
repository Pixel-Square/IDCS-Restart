from rest_framework import serializers
from .models import AttendanceRecord, UploadLog, HalfDayRequest, Holiday


class AttendanceRecordSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    full_name = serializers.SerializerMethodField()
    staff_id = serializers.SerializerMethodField()
    
    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'user', 'user_name', 'full_name', 'staff_id', 'date',
            'morning_in', 'evening_out', 'status', 'notes',
            'uploaded_by', 'uploaded_at', 'source_file'
        ]
        read_only_fields = ['uploaded_by', 'uploaded_at']
    
    def get_full_name(self, obj):
        return obj.user.get_full_name() if hasattr(obj.user, 'get_full_name') else obj.user.username

    def get_staff_id(self, obj):
        try:
            return obj.user.staff_profile.staff_id
        except Exception:
            return None


class UploadLogSerializer(serializers.ModelSerializer):
    uploader_name = serializers.CharField(source='uploader.username', read_only=True)
    
    class Meta:
        model = UploadLog
        fields = [
            'id', 'uploader', 'uploader_name', 'filename',
            'uploaded_at', 'target_date', 'processed_rows',
            'success_count', 'error_count', 'errors', 'file'
        ]
        read_only_fields = ['uploader', 'uploaded_at']


class CSVUploadSerializer(serializers.Serializer):
    """Serializer for CSV file upload"""
    file = serializers.FileField()
    dry_run = serializers.BooleanField(default=False, required=False)
    overwrite_existing = serializers.BooleanField(default=False, required=False)


class HalfDayRequestSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff_user.username', read_only=True)
    staff_full_name = serializers.CharField(source='staff_user.get_full_name', read_only=True)
    staff_id = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source='reviewed_by.username', read_only=True)
    
    class Meta:
        model = HalfDayRequest
        fields = [
            'id', 'staff_user', 'staff_name', 'staff_full_name', 'staff_id', 'department',
            'attendance_date', 'requested_at',
            'reason', 'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'review_notes', 'can_mark_attendance'
        ]
        read_only_fields = ['staff_user', 'requested_at', 'reviewed_by', 'reviewed_at']
    
    def get_staff_id(self, obj):
        """Get staff ID from staff profile"""
        try:
            return obj.staff_user.staff_profile.staff_id
        except:
            return None
    
    def get_department(self, obj):
        """Get department name from staff profile"""
        try:
            dept = obj.staff_user.staff_profile.department
            return {
                'id': dept.id,
                'name': dept.name,
                'code': getattr(dept, 'code', '') or ''
            }
        except:
            return None


class HalfDayRequestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating period attendance access requests"""
    
    class Meta:
        model = HalfDayRequest
        fields = ['attendance_date', 'reason']
    
    def validate_attendance_date(self, value):
        """Ensure date is not in the future"""
        from django.utils import timezone
        today = timezone.localtime(timezone.now()).date()
        if value > today:
            raise serializers.ValidationError("Cannot request access for future dates")
        return value
    
    def create(self, validated_data):
        """Create attendance access request for the current user"""
        validated_data['staff_user'] = self.context['request'].user
        return super().create(validated_data)


class HalfDayRequestReviewSerializer(serializers.ModelSerializer):
    """Serializer for HOD/AHOD to review period attendance access requests"""
    
    class Meta:
        model = HalfDayRequest
        fields = ['status', 'review_notes']
    
    def validate_status(self, value):
        if value not in ['approved', 'rejected']:
            raise serializers.ValidationError("Status must be 'approved' or 'rejected'")
        return value


class HolidaySerializer(serializers.ModelSerializer):
    """Serializer for Holiday model"""
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = Holiday
        fields = ['id', 'date', 'name', 'notes', 'created_by', 'created_by_name', 'created_at']
        read_only_fields = ['created_by', 'created_at']


class HolidayCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating holidays"""
    
    class Meta:
        model = Holiday
        fields = ['date', 'name', 'notes']
    
    def validate_date(self, value):
        """Ensure the date is not in the past (optional validation)"""
        # Allow past dates for historical data
        return value
