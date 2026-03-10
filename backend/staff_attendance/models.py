from django.db import models
from django.conf import settings
from django.utils import timezone


class AttendanceRecord(models.Model):
    """Records daily attendance for staff members"""
    # No choices constraint - accepts any status code from leave templates
    # Common values: 'present', 'absent', 'half_day', 'partial', 'OD', 'LEAVE', 'CL', 'ML', 'COL', etc.
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='attendance_records'
    )
    date = models.DateField(db_index=True)
    morning_in = models.TimeField(null=True, blank=True)
    evening_out = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=20, default='absent', help_text='Attendance status code - can be any value from leave templates')
    notes = models.TextField(blank=True)
    
    # Audit fields
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploaded_attendance_records'
    )
    uploaded_at = models.DateTimeField(default=timezone.now)
    source_file = models.CharField(max_length=255, blank=True)
    
    class Meta:
        db_table = 'staff_attendance_record'
        unique_together = [['user', 'date']]
        ordering = ['-date', 'user']
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['date', 'status']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.date} - {self.status}"
    
    def update_status(self):
        """Auto-determine status based on morning_in and evening_out"""
        if not self.morning_in and not self.evening_out:
            self.status = 'absent'
        elif self.morning_in and self.evening_out:
            self.status = 'present'
        elif self.morning_in or self.evening_out:
            self.status = 'partial'
        else:
            self.status = 'absent'


class UploadLog(models.Model):
    """Logs each CSV upload by PS"""
    uploader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    filename = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    target_date = models.DateField(help_text="Upload date used to determine columns")
    
    # Processing results
    processed_rows = models.IntegerField(default=0)
    success_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    errors = models.JSONField(default=list, blank=True)
    
    # Store original file
    file = models.FileField(upload_to='attendance_uploads/%Y/%m/', null=True, blank=True)
    
    class Meta:
        db_table = 'staff_attendance_upload_log'
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f"{self.filename} - {self.uploaded_at.strftime('%Y-%m-%d %H:%M')}"


class HalfDayRequest(models.Model):
    """Staff requests for period attendance access from HOD/AHOD"""
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    # Staff requesting access
    staff_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='attendance_access_requests'
    )
    
    # Date for which access is requested
    attendance_date = models.DateField(help_text="Date for which period attendance access is requested")
    
    # Request details
    requested_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(help_text="Staff reason for requesting period attendance access")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # HOD/AHOD approval
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_attendance_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, help_text="HOD/AHOD review comments")
    
    class Meta:
        db_table = 'staff_attendance_halfday_request'
        unique_together = [['staff_user', 'attendance_date']]
        ordering = ['-requested_at']
    
    def __str__(self):
        return f"{self.staff_user.username} - {self.attendance_date} - {self.status}"
    
    @property
    def can_mark_attendance(self):
        """Check if staff can mark period attendance for this date"""
        return self.status == 'approved'


class Holiday(models.Model):
    """Records holidays when attendance should not be marked"""
    date = models.DateField(unique=True, db_index=True)
    name = models.CharField(max_length=200, help_text="Holiday name/description")
    notes = models.TextField(blank=True, help_text="Additional notes")
    is_sunday = models.BooleanField(default=False, help_text="True if this is an auto-generated Sunday holiday")
    is_removable = models.BooleanField(default=True, help_text="If False, this holiday cannot be deleted")
    
    # Audit fields
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_holidays'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'staff_attendance_holiday'
        ordering = ['-date']
        indexes = [
            models.Index(fields=['date']),
        ]
    
    def __str__(self):
        return f"{self.date} - {self.name}"


class AttendanceSettings(models.Model):
    """Global settings for attendance time limits and absence rules"""
    attendance_in_time_limit = models.TimeField(
        default='08:45:00',
        help_text="If morning_in is after this time, mark as absent"
    )
    attendance_out_time_limit = models.TimeField(
        default='17:45:00',
        help_text="If evening_out is before this time, mark as absent"
    )
    apply_time_based_absence = models.BooleanField(
        default=True,
        help_text="Enable time-based absence marking"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_attendance_settings'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'staff_attendance_settings'
        verbose_name = 'Attendance Settings'
        verbose_name_plural = 'Attendance Settings'
    
    def __str__(self):
        return f"Attendance Settings (Updated: {self.updated_at.strftime('%Y-%m-%d %H:%M')})"
